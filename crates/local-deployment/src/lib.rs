use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::DBService;
use deployment::{Deployment, DeploymentError, RemoteClientNotConfigured};
use executors::profile::ExecutorConfigs;
use services::services::{
    approvals::Approvals,
    auth::AuthContext,
    config::{Config, load_config_from_file, save_config_to_file},
    connection_token::ConnectionTokenValidator,
    container::ContainerService,
    drafts::DraftsService,
    events::EventService,
    file_search_cache::FileSearchCache,
    filesystem::FilesystemService,
    git::GitService,
    image::ImageService,
    node_cache::NodeCacheSyncService,
    node_proxy_client::NodeProxyClient,
    node_runner::{NodeRunnerConfig, NodeRunnerContext, spawn_node_runner},
    oauth_credentials::OAuthCredentials,
    remote_client::{RemoteClient, RemoteClientError},
    share::{RemoteSyncHandle, ShareConfig, SharePublisher},
};
use tokio::sync::{Mutex, RwLock};
use utils::{
    api::oauth::LoginStatus,
    assets::{backup_dir, config_path, credentials_path, database_path},
    msg_store::MsgStore,
};
use uuid::Uuid;

use crate::container::LocalContainerService;
mod command;
pub mod container;
pub mod message_queue;

#[derive(Clone)]
pub struct LocalDeployment {
    config: Arc<RwLock<Config>>,
    user_id: String,
    db: DBService,
    container: LocalContainerService,
    git: GitService,
    image: ImageService,
    filesystem: FilesystemService,
    events: EventService,
    file_search_cache: Arc<FileSearchCache>,
    approvals: Approvals,
    drafts: DraftsService,
    share_publisher: Result<SharePublisher, RemoteClientNotConfigured>,
    share_sync_handle: Arc<Mutex<Option<RemoteSyncHandle>>>,
    share_config: Option<ShareConfig>,
    remote_client: Result<RemoteClient, RemoteClientNotConfigured>,
    /// API key-based client for node operations (available even when not logged in via OAuth)
    node_auth_client: Option<RemoteClient>,
    auth_context: AuthContext,
    oauth_handoffs: Arc<RwLock<HashMap<Uuid, PendingHandoff>>>,
    /// Node runner context (if connected to a hive) - provides state access and message sending
    node_runner_context: Option<NodeRunnerContext>,
    /// Validator for connection tokens (for direct frontend-to-node connections)
    connection_token_validator: Arc<ConnectionTokenValidator>,
    /// HTTP client for proxying requests to remote nodes
    node_proxy_client: NodeProxyClient,
    /// Whether the node cache sync has been started
    node_cache_sync_started: Arc<Mutex<bool>>,
    /// Timestamp of the last VACUUM operation (for rate limiting)
    last_vacuum_time: Arc<RwLock<Option<std::time::Instant>>>,
}

#[derive(Debug, Clone)]
struct PendingHandoff {
    provider: String,
    app_verifier: String,
}

#[async_trait]
impl Deployment for LocalDeployment {
    /// Creates and initializes a LocalDeployment with all core services, background tasks, and optional
    /// remote/hive integrations configured from environment and persisted config.
    ///
    /// The function performs startup work such as loading and persisting configuration, initializing
    /// the database (with event hooks), image and filesystem services, auth context, optional remote
    /// clients (OAuth and API-key-based), node runner (when configured), and starts background tasks
    /// like orphaned image cleanup and node cache synchronization when applicable.
    ///
    /// # Returns
    ///
    /// A fully initialized `LocalDeployment` on success.
    ///
    /// # Examples
    ///
    /// ```
    /// # tokio_test::block_on(async {
    /// let deployment = LocalDeployment::new().await.unwrap();
    /// assert!(!deployment.user_id().is_empty());
    /// # });
    /// ```
    async fn new() -> Result<Self, DeploymentError> {
        // Load config and OAuth credentials in parallel for faster startup
        let config_path = config_path();
        let creds_path = credentials_path();
        let (mut raw_config, oauth_credentials) =
            tokio::join!(load_config_from_file(&config_path), async {
                let creds = Arc::new(OAuthCredentials::new(creds_path));
                if let Err(e) = creds.load().await {
                    tracing::warn!(?e, "failed to load OAuth credentials");
                }
                creds
            });

        let profiles = ExecutorConfigs::get_cached();
        if !raw_config.onboarding_acknowledged
            && let Ok(recommended_executor) = profiles.get_recommended_executor_profile().await
        {
            raw_config.executor_profile = recommended_executor;
        }

        // Check if app version has changed and set release notes flag
        {
            let current_version = utils::version::APP_VERSION;
            let stored_version = raw_config.last_app_version.as_deref();

            if stored_version != Some(current_version) {
                // Show release notes only if this is an upgrade (not first install)
                raw_config.show_release_notes = stored_version.is_some();
                raw_config.last_app_version = Some(current_version.to_string());
            }
        }

        // Always save config (may have been migrated or version updated)
        save_config_to_file(&raw_config, &config_path).await?;

        // Log storage locations at startup for debugging
        tracing::info!(
            database = %database_path().display(),
            backups = %backup_dir().display(),
            worktrees = %services::services::worktree_manager::WorktreeManager::get_worktree_base_dir().display(),
            "Storage locations"
        );

        let config = Arc::new(RwLock::new(raw_config));
        // Generate a unique user ID for this deployment
        let user_id = Uuid::new_v4().to_string();
        let git = GitService::new();
        let msg_stores = Arc::new(RwLock::new(HashMap::new()));
        let filesystem = FilesystemService::new();

        // Create shared components for EventService
        let events_msg_store = Arc::new(MsgStore::new());
        let events_entry_count = Arc::new(RwLock::new(0));

        // Create DB with event hooks
        // Use bootstrap() for the hook's internal DB (lightweight, no migrations)
        // Then create the main DB with the hook attached (runs full init + migrations)
        let db = {
            let bootstrap_db = DBService::bootstrap().await?;
            let hook = EventService::create_hook(
                events_msg_store.clone(),
                events_entry_count.clone(),
                bootstrap_db,
            );
            DBService::new_with_after_connect(hook).await?
        };

        let image = ImageService::new(db.clone().pool)?;
        {
            let image_service = image.clone();
            tokio::spawn(async move {
                tracing::info!("Starting orphaned image cleanup...");
                if let Err(e) = image_service.delete_orphaned_images().await {
                    tracing::error!("Failed to clean up orphaned images: {}", e);
                }
            });
        }

        let approvals = Approvals::new(msg_stores.clone());

        let share_config = ShareConfig::from_env();

        // oauth_credentials already loaded in parallel at startup

        let profile_cache = Arc::new(RwLock::new(None));
        let auth_context = AuthContext::new(oauth_credentials.clone(), profile_cache.clone());

        let api_base = std::env::var("VK_SHARED_API_BASE")
            .ok()
            .or_else(|| option_env!("VK_SHARED_API_BASE").map(|s| s.to_string()));

        // Create OAuth-based remote client for user-initiated operations (frontend)
        let remote_client = match &api_base {
            Some(url) => match RemoteClient::new(url, auth_context.clone()) {
                Ok(client) => {
                    tracing::info!("Remote client initialized with URL: {}", url);
                    Ok(client)
                }
                Err(e) => {
                    tracing::error!(?e, "failed to create remote client");
                    Err(RemoteClientNotConfigured)
                }
            },
            None => {
                tracing::info!("VK_SHARED_API_BASE not set; remote features disabled");
                Err(RemoteClientNotConfigured)
            }
        };

        // Create API key-based remote client for node sync operations (no user login required)
        // This allows nodes to sync with the hive even when no user is logged in
        let node_auth_client: Option<RemoteClient> =
            match (api_base.as_ref(), std::env::var("VK_NODE_API_KEY").ok()) {
                (Some(url), Some(api_key)) => match RemoteClient::new_with_api_key(url, api_key) {
                    Ok(client) => {
                        tracing::info!("Node auth client initialized for hive sync");
                        Some(client)
                    }
                    Err(e) => {
                        tracing::error!(?e, "failed to create node auth client");
                        None
                    }
                },
                _ => None,
            };

        let share_publisher = remote_client
            .as_ref()
            .map(|client| SharePublisher::new(db.clone(), client.clone()))
            .map_err(|e| *e);

        let oauth_handoffs = Arc::new(RwLock::new(HashMap::new()));
        let share_sync_handle = Arc::new(Mutex::new(None));

        let mut share_sync_config: Option<ShareConfig> = None;
        if let (Some(sc_ref), Ok(_)) = (share_config.as_ref(), &share_publisher)
            && oauth_credentials.get().await.is_some()
        {
            share_sync_config = Some(sc_ref.clone());
        }

        let container = LocalContainerService::new(
            db.clone(),
            msg_stores.clone(),
            config.clone(),
            git.clone(),
            image.clone(),
            approvals.clone(),
            share_publisher.clone(),
        )
        .await;

        let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

        let drafts = DraftsService::new(db.clone(), image.clone());
        let file_search_cache = Arc::new(FileSearchCache::new());

        // Initialize node runner and connection token validator if hive connection is configured
        let (node_runner_context, connection_token_validator, node_proxy_client) =
            if let Some(node_config) = NodeRunnerConfig::from_env() {
                tracing::info!(
                    hive_url = %node_config.hive_url,
                    node_name = %node_config.node_name,
                    "starting node runner to connect to hive"
                );

                // Create connection token validator if secret is configured
                let validator = if let Some(secret) = node_config.connection_token_secret.clone() {
                    tracing::info!("connection token validation enabled for direct log streaming");
                    ConnectionTokenValidator::new(secret)
                } else {
                    tracing::debug!(
                        "VK_CONNECTION_TOKEN_SECRET not set; direct log streaming auth disabled"
                    );
                    ConnectionTokenValidator::disabled()
                };

                // Create node proxy client with the same secret
                // Note: local_node_id will be set after the node authenticates with the hive
                let proxy_client =
                    NodeProxyClient::new(node_config.connection_token_secret.clone(), None);
                if proxy_client.is_enabled() {
                    tracing::info!("node proxy client enabled for remote project operations");
                }

                // Pass the container and node_auth_client to spawn_node_runner to enable
                // task execution and remote project sync.
                // Use node_auth_client (API key auth) instead of remote_client (OAuth auth)
                // so sync can happen without requiring user login.
                (
                    spawn_node_runner(
                        node_config,
                        db.clone(),
                        Some(container.clone()),
                        node_auth_client.clone(),
                    ),
                    validator,
                    proxy_client,
                )
            } else {
                // Log which env vars are missing to help with debugging
                let has_hive_url = std::env::var("VK_HIVE_URL").is_ok();
                let has_api_key = std::env::var("VK_NODE_API_KEY").is_ok();
                if !has_hive_url && !has_api_key {
                    tracing::debug!(
                        "VK_HIVE_URL and VK_NODE_API_KEY not set; node runner disabled"
                    );
                } else if !has_hive_url {
                    tracing::debug!(
                        "VK_HIVE_URL not set; node runner disabled (VK_NODE_API_KEY is set)"
                    );
                } else {
                    tracing::debug!(
                        "VK_NODE_API_KEY not set; node runner disabled (VK_HIVE_URL is set)"
                    );
                }
                (
                    None,
                    ConnectionTokenValidator::disabled(),
                    NodeProxyClient::disabled(),
                )
            };

        let deployment = Self {
            config,
            user_id,
            db,
            container,
            git,
            image,
            filesystem,
            events,
            file_search_cache,
            approvals,
            drafts,
            share_publisher,
            share_sync_handle: share_sync_handle.clone(),
            share_config: share_config.clone(),
            remote_client,
            node_auth_client,
            auth_context,
            oauth_handoffs,
            node_runner_context,
            connection_token_validator: Arc::new(connection_token_validator),
            node_proxy_client,
            node_cache_sync_started: Arc::new(Mutex::new(false)),
            last_vacuum_time: Arc::new(RwLock::new(None)),
        };

        // Log startup config summary for debugging connection issues
        let has_shared_api = std::env::var("VK_SHARED_API_BASE").is_ok();
        let has_hive_url = std::env::var("VK_HIVE_URL").is_ok();
        let has_api_key = std::env::var("VK_NODE_API_KEY").is_ok();

        match &deployment.node_runner_context {
            Some(_) => {
                tracing::info!("Hive connection: enabled (node runner started)");
            }
            None => {
                if has_shared_api && (!has_hive_url || !has_api_key) {
                    // This is the case where something might be misconfigured
                    tracing::warn!(
                        has_hive_url = has_hive_url,
                        has_api_key = has_api_key,
                        "Hive connection: DISABLED - VK_SHARED_API_BASE is set but hive config is incomplete. \
                         Check VK_HIVE_URL and VK_NODE_API_KEY in your .env file for typos."
                    );
                } else if !has_shared_api {
                    tracing::info!("Hive connection: not configured (standalone mode)");
                }
            }
        }

        if let Some(sc) = share_sync_config {
            deployment.spawn_remote_sync(sc);
        }

        // Start node cache sync if user is already logged in
        // (runs in background, syncs nodes/projects from all organizations)
        {
            let d = deployment.clone();
            tokio::spawn(async move {
                d.start_node_cache_sync().await;
            });
        }

        Ok(deployment)
    }

    fn user_id(&self) -> &str {
        &self.user_id
    }

    fn config(&self) -> &Arc<RwLock<Config>> {
        &self.config
    }

    fn db(&self) -> &DBService {
        &self.db
    }

    fn container(&self) -> &impl ContainerService {
        &self.container
    }

    fn git(&self) -> &GitService {
        &self.git
    }

    fn image(&self) -> &ImageService {
        &self.image
    }

    fn filesystem(&self) -> &FilesystemService {
        &self.filesystem
    }

    fn events(&self) -> &EventService {
        &self.events
    }

    fn file_search_cache(&self) -> &Arc<FileSearchCache> {
        &self.file_search_cache
    }

    fn approvals(&self) -> &Approvals {
        &self.approvals
    }

    fn drafts(&self) -> &DraftsService {
        &self.drafts
    }

    fn share_publisher(&self) -> Result<SharePublisher, RemoteClientNotConfigured> {
        self.share_publisher.clone()
    }

    fn share_sync_handle(&self) -> &Arc<Mutex<Option<RemoteSyncHandle>>> {
        &self.share_sync_handle
    }

    fn auth_context(&self) -> &AuthContext {
        &self.auth_context
    }
}

impl LocalDeployment {
    pub fn remote_client(&self) -> Result<RemoteClient, RemoteClientNotConfigured> {
        self.remote_client.clone()
    }

    pub async fn get_login_status(&self) -> LoginStatus {
        if self.auth_context.get_credentials().await.is_none() {
            self.auth_context.clear_profile().await;
            return LoginStatus::LoggedOut;
        };

        if let Some(cached_profile) = self.auth_context.cached_profile().await {
            return LoginStatus::LoggedIn {
                profile: cached_profile,
            };
        }

        let Ok(client) = self.remote_client() else {
            return LoginStatus::LoggedOut;
        };

        match client.profile().await {
            Ok(profile) => {
                self.auth_context.set_profile(profile.clone()).await;
                LoginStatus::LoggedIn { profile }
            }
            Err(RemoteClientError::Auth) => {
                let _ = self.auth_context.clear_credentials().await;
                self.auth_context.clear_profile().await;
                LoginStatus::LoggedOut
            }
            Err(_) => LoginStatus::LoggedOut,
        }
    }

    pub async fn store_oauth_handoff(
        &self,
        handoff_id: Uuid,
        provider: String,
        app_verifier: String,
    ) {
        self.oauth_handoffs.write().await.insert(
            handoff_id,
            PendingHandoff {
                provider,
                app_verifier,
            },
        );
    }

    pub async fn take_oauth_handoff(&self, handoff_id: &Uuid) -> Option<(String, String)> {
        self.oauth_handoffs
            .write()
            .await
            .remove(handoff_id)
            .map(|state| (state.provider, state.app_verifier))
    }

    pub fn share_config(&self) -> Option<&ShareConfig> {
        self.share_config.as_ref()
    }

    /// Get the node runner context (if connected to a hive).
    ///
    /// This provides both read access to state and the ability to send messages to the hive.
    pub fn node_runner_context(&self) -> Option<&NodeRunnerContext> {
        self.node_runner_context.as_ref()
    }

    /// Check if this instance is running as a node connected to a hive.
    pub async fn is_node_connected(&self) -> bool {
        if let Some(ctx) = &self.node_runner_context {
            ctx.is_connected().await
        } else {
            false
        }
    }

    /// Get the connection token validator for direct log streaming authentication.
    pub fn connection_token_validator(&self) -> &Arc<ConnectionTokenValidator> {
        &self.connection_token_validator
    }

    /// Get the node proxy client for proxying requests to remote nodes.
    pub fn node_proxy_client(&self) -> &NodeProxyClient {
        &self.node_proxy_client
    }

    /// Get the API key-based remote client for node operations.
    ///
    /// This client uses the VK_NODE_API_KEY for authentication and is available
    /// even when no user is logged in via OAuth. Use this for hive operations
    /// that don't require user-specific permissions.
    pub fn node_auth_client(&self) -> Option<&RemoteClient> {
        self.node_auth_client.as_ref()
    }

    /// Get direct access to the local container service.
    ///
    /// This is needed because the `Deployment::container()` method returns
    /// `&impl ContainerService`, which doesn't expose LocalContainerService-specific
    /// methods like `message_queue()`.
    pub fn local_container(&self) -> &LocalContainerService {
        &self.container
    }

    /// Get the last VACUUM time (for rate limiting).
    pub fn last_vacuum_time(&self) -> &Arc<RwLock<Option<std::time::Instant>>> {
        &self.last_vacuum_time
    }

    /// Start the background node cache sync if the user is logged in.
    ///
    /// This spawns a background task that periodically syncs nodes and projects
    /// from all organizations the user has access to.
    pub async fn start_node_cache_sync(&self) {
        // Only start once
        let mut started = self.node_cache_sync_started.lock().await;
        if *started {
            tracing::debug!("node cache sync already started, skipping");
            return;
        }

        // Need remote client and credentials
        let Ok(client) = self.remote_client() else {
            tracing::warn!("remote client not configured, skipping node cache sync");
            return;
        };

        if self.auth_context.get_credentials().await.is_none() {
            tracing::warn!("not logged in, skipping node cache sync");
            return;
        }

        // Log which database we're using
        tracing::info!(
            db_path = %database_path().display(),
            "starting background node cache sync"
        );
        *started = true;

        let pool = self.db.pool.clone();
        let sync_service = NodeCacheSyncService::new(pool, client);

        tokio::spawn(async move {
            sync_service.run().await;
        });
    }
}
