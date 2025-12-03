use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::DBService;
use deployment::{Deployment, DeploymentError, RemoteClientNotConfigured};
use executors::profile::ExecutorConfigs;
use services::services::{
    analytics::{AnalyticsConfig, AnalyticsContext, AnalyticsService, generate_user_id},
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
    node_runner::{NodeRunnerConfig, NodeRunnerState, spawn_node_runner},
    oauth_credentials::OAuthCredentials,
    remote_client::{RemoteClient, RemoteClientError},
    share::{RemoteSyncHandle, ShareConfig, SharePublisher},
};
use tokio::sync::{Mutex, RwLock};
use utils::{
    api::oauth::LoginStatus,
    assets::{config_path, credentials_path},
    msg_store::MsgStore,
};
use uuid::Uuid;

use crate::container::LocalContainerService;
mod command;
pub mod container;

#[derive(Clone)]
pub struct LocalDeployment {
    config: Arc<RwLock<Config>>,
    user_id: String,
    db: DBService,
    analytics: Option<AnalyticsService>,
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
    auth_context: AuthContext,
    oauth_handoffs: Arc<RwLock<HashMap<Uuid, PendingHandoff>>>,
    /// Node runner state (if connected to a hive)
    node_runner_state: Option<Arc<RwLock<NodeRunnerState>>>,
    /// Validator for connection tokens (for direct frontend-to-node connections)
    connection_token_validator: Arc<ConnectionTokenValidator>,
    /// Whether the node cache sync has been started
    node_cache_sync_started: Arc<Mutex<bool>>,
}

#[derive(Debug, Clone)]
struct PendingHandoff {
    provider: String,
    app_verifier: String,
}

#[async_trait]
impl Deployment for LocalDeployment {
    async fn new() -> Result<Self, DeploymentError> {
        let mut raw_config = load_config_from_file(&config_path()).await;

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
        save_config_to_file(&raw_config, &config_path()).await?;

        let config = Arc::new(RwLock::new(raw_config));
        let user_id = generate_user_id();
        let analytics = AnalyticsConfig::new().map(AnalyticsService::new);
        let git = GitService::new();
        let msg_stores = Arc::new(RwLock::new(HashMap::new()));
        let filesystem = FilesystemService::new();

        // Create shared components for EventService
        let events_msg_store = Arc::new(MsgStore::new());
        let events_entry_count = Arc::new(RwLock::new(0));

        // Create DB with event hooks
        let db = {
            let hook = EventService::create_hook(
                events_msg_store.clone(),
                events_entry_count.clone(),
                DBService::new().await?, // Temporary DB service for the hook
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

        let oauth_credentials = Arc::new(OAuthCredentials::new(credentials_path()));
        if let Err(e) = oauth_credentials.load().await {
            tracing::warn!(?e, "failed to load OAuth credentials");
        }

        let profile_cache = Arc::new(RwLock::new(None));
        let auth_context = AuthContext::new(oauth_credentials.clone(), profile_cache.clone());

        let api_base = std::env::var("VK_SHARED_API_BASE")
            .ok()
            .or_else(|| option_env!("VK_SHARED_API_BASE").map(|s| s.to_string()));

        let remote_client = match api_base {
            Some(url) => match RemoteClient::new(&url, auth_context.clone()) {
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

        // We need to make analytics accessible to the ContainerService
        // TODO: Handle this more gracefully
        let analytics_ctx = analytics.as_ref().map(|s| AnalyticsContext {
            user_id: user_id.clone(),
            analytics_service: s.clone(),
        });
        let container = LocalContainerService::new(
            db.clone(),
            msg_stores.clone(),
            config.clone(),
            git.clone(),
            image.clone(),
            analytics_ctx,
            approvals.clone(),
            share_publisher.clone(),
        )
        .await;

        let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

        let drafts = DraftsService::new(db.clone(), image.clone());
        let file_search_cache = Arc::new(FileSearchCache::new());

        // Initialize node runner and connection token validator if hive connection is configured
        let (node_runner_state, connection_token_validator) =
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

                // Pass the container to spawn_node_runner to enable task execution
                (
                    spawn_node_runner(node_config, db.clone(), Some(container.clone())),
                    validator,
                )
            } else {
                // Log which env vars are missing to help with debugging
                let has_hive_url = std::env::var("VK_HIVE_URL").is_ok();
                let has_api_key = std::env::var("VK_NODE_API_KEY").is_ok();
                if !has_hive_url && !has_api_key {
                    tracing::debug!("VK_HIVE_URL and VK_NODE_API_KEY not set; node runner disabled");
                } else if !has_hive_url {
                    tracing::debug!("VK_HIVE_URL not set; node runner disabled (VK_NODE_API_KEY is set)");
                } else {
                    tracing::debug!("VK_NODE_API_KEY not set; node runner disabled (VK_HIVE_URL is set)");
                }
                (None, ConnectionTokenValidator::disabled())
            };

        let deployment = Self {
            config,
            user_id,
            db,
            analytics,
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
            auth_context,
            oauth_handoffs,
            node_runner_state,
            connection_token_validator: Arc::new(connection_token_validator),
            node_cache_sync_started: Arc::new(Mutex::new(false)),
        };

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

    fn analytics(&self) -> &Option<AnalyticsService> {
        &self.analytics
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

    /// Get the node runner state (if connected to a hive).
    pub fn node_runner_state(&self) -> Option<&Arc<RwLock<NodeRunnerState>>> {
        self.node_runner_state.as_ref()
    }

    /// Check if this instance is running as a node connected to a hive.
    pub async fn is_node_connected(&self) -> bool {
        if let Some(state) = &self.node_runner_state {
            state.read().await.connected
        } else {
            false
        }
    }

    /// Get the connection token validator for direct log streaming authentication.
    pub fn connection_token_validator(&self) -> &Arc<ConnectionTokenValidator> {
        &self.connection_token_validator
    }

    /// Start the background node cache sync if the user is logged in.
    ///
    /// This spawns a background task that periodically syncs nodes and projects
    /// from all organizations the user has access to.
    pub async fn start_node_cache_sync(&self) {
        // Only start once
        let mut started = self.node_cache_sync_started.lock().await;
        if *started {
            return;
        }

        // Need remote client and credentials
        let Ok(client) = self.remote_client() else {
            tracing::debug!("remote client not configured, skipping node cache sync");
            return;
        };

        if self.auth_context.get_credentials().await.is_none() {
            tracing::debug!("not logged in, skipping node cache sync");
            return;
        }

        tracing::info!("starting background node cache sync");
        *started = true;

        let pool = self.db.pool.clone();
        let sync_service = NodeCacheSyncService::new(pool, client);

        tokio::spawn(async move {
            sync_service.run().await;
        });
    }
}
