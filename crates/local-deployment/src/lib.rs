use std::{collections::HashMap, sync::Arc};

use api_types::LoginStatus;
use async_trait::async_trait;
use client_info::ClientInfo;
use db::DBService;
use deployment::{Deployment, DeploymentError};
use executors::profile::ExecutorConfigs;
use git::GitService;
use preview_proxy::PreviewProxyService;
use relay_control::{RelayControl, signing::RelaySigningService};
use services::services::{
    analytics::{AnalyticsConfig, AnalyticsContext, AnalyticsService, generate_user_id},
    approvals::Approvals,
    auth::AuthContext,
    config::{Config, load_config_from_file, save_config_to_file},
    container::ContainerService,
    events::EventService,
    file::FileService,
    file_search::FileSearchCache,
    filesystem::FilesystemService,
    oauth_credentials::OAuthCredentials,
    pr_monitor::PrMonitorService,
    queued_message::QueuedMessageService,
    repo::RepoService,
};
use tokio::sync::{Notify, RwLock};
use tokio_util::sync::CancellationToken;
use trusted_key_auth::runtime::TrustedKeyAuthRuntime;
use utils::{
    assets::{config_path, credentials_path, server_signing_key_path, trusted_keys_path},
    msg_store::MsgStore,
};
use workspace_manager::WorkspaceManager;
use worktree_manager::WorktreeManager;

use crate::{container::LocalContainerService, pty::PtyService};
mod command;
pub mod container;
mod copy;
pub mod pty;

#[derive(Clone)]
pub struct LocalDeployment {
    config: Arc<RwLock<Config>>,
    user_id: String,
    db: DBService,
    workspace_manager: WorkspaceManager,
    analytics: Option<AnalyticsService>,
    container: LocalContainerService,
    git: GitService,
    repo: RepoService,
    file: FileService,
    filesystem: FilesystemService,
    events: EventService,
    file_search_cache: Arc<FileSearchCache>,
    approvals: Approvals,
    queued_message_service: QueuedMessageService,
    auth_context: AuthContext,
    trusted_key_auth: TrustedKeyAuthRuntime,
    relay_signing: RelaySigningService,
    relay_control: Arc<RelayControl>,
    client_info: ClientInfo,
    preview_proxy: PreviewProxyService,
    _shutdown: CancellationToken,
    ssh_config: Arc<russh::server::Config>,
    pty: PtyService,
    pr_sync_notify: Arc<Notify>,
}

#[async_trait]
impl Deployment for LocalDeployment {
    async fn new(shutdown: CancellationToken) -> Result<Self, DeploymentError> {
        // Run one-time process logs migration from DB to filesystem
        services::services::execution_process::migrate_execution_logs_to_files()
            .await
            .map_err(|e| DeploymentError::Other(anyhow::anyhow!("Migration failed: {}", e)))?;

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
                raw_config.show_release_notes = stored_version.is_some();
                raw_config.last_app_version = Some(current_version.to_string());
            }
        }

        // Always save config (may have been migrated or version updated)
        save_config_to_file(&raw_config, &config_path()).await?;

        if let Some(workspace_dir) = &raw_config.workspace_dir {
            let path = utils::path::expand_tilde(workspace_dir);
            WorktreeManager::set_workspace_dir_override(path);
        }

        let config = Arc::new(RwLock::new(raw_config));
        let user_id = generate_user_id();
        let analytics = AnalyticsConfig::new().map(AnalyticsService::new);
        let git = GitService::new();
        let repo = RepoService::new();
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
                DBService::new().await?,
            );
            DBService::new_with_after_connect(hook).await?
        };

        let file = FileService::new(db.clone().pool)?;
        {
            let file_service = file.clone();
            tokio::spawn(async move {
                tracing::info!("Starting orphaned file cleanup...");
                if let Err(e) = file_service.delete_orphaned_files().await {
                    tracing::error!("Failed to clean up orphaned files: {}", e);
                }
            });
        }

        let approvals = Approvals::new();
        let queued_message_service = QueuedMessageService::new();

        let oauth_credentials = Arc::new(OAuthCredentials::new(credentials_path()));
        if let Err(e) = oauth_credentials.load().await {
            tracing::warn!(?e, "failed to load OAuth credentials");
        }

        let profile_cache = Arc::new(RwLock::new(None));
        let auth_context = AuthContext::new(oauth_credentials.clone(), profile_cache.clone());

        let trusted_key_auth = TrustedKeyAuthRuntime::new(trusted_keys_path());
        let relay_signing = RelaySigningService::load_or_generate(&server_signing_key_path())
            .expect("Failed to load or generate server signing key");
        let relay_control = Arc::new(RelayControl::new());
        let client_info = ClientInfo::new();
        let preview_proxy = PreviewProxyService::new();

        let ssh_config = embedded_ssh::config::build_config(relay_signing.signing_key());

        let analytics_ctx = analytics.as_ref().map(|s| AnalyticsContext {
            user_id: user_id.clone(),
            analytics_service: s.clone(),
        });
        let workspace_manager = WorkspaceManager::new(db.clone());
        let container = LocalContainerService::new(
            db.clone(),
            workspace_manager.clone(),
            msg_stores.clone(),
            config.clone(),
            git.clone(),
            file.clone(),
            analytics_ctx,
            approvals.clone(),
            queued_message_service.clone(),
        )
        .await;

        let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

        let file_search_cache = Arc::new(FileSearchCache::new());

        let pty = PtyService::new();
        let pr_sync_notify = Arc::new(Notify::new());
        {
            let db = db.clone();
            let analytics = analytics.as_ref().map(|s| AnalyticsContext {
                user_id: user_id.clone(),
                analytics_service: s.clone(),
            });
            let container = container.clone();
            PrMonitorService::spawn(db, analytics, container, pr_sync_notify.clone()).await;
        }

        let deployment = Self {
            config,
            user_id,
            db,
            workspace_manager,
            analytics,
            container,
            git,
            repo,
            file,
            filesystem,
            events,
            file_search_cache,
            approvals,
            queued_message_service,
            auth_context,
            trusted_key_auth,
            relay_signing,
            relay_control,
            client_info,
            preview_proxy,
            _shutdown: shutdown,
            ssh_config,
            pty,
            pr_sync_notify,
        };

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

    fn repo(&self) -> &RepoService {
        &self.repo
    }

    fn file(&self) -> &FileService {
        &self.file
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

    fn queued_message_service(&self) -> &QueuedMessageService {
        &self.queued_message_service
    }

    fn auth_context(&self) -> &AuthContext {
        &self.auth_context
    }

    fn relay_control(&self) -> &Arc<RelayControl> {
        &self.relay_control
    }

    fn relay_signing(&self) -> &RelaySigningService {
        &self.relay_signing
    }

    fn client_info(&self) -> &ClientInfo {
        &self.client_info
    }

    fn preview_proxy(&self) -> &PreviewProxyService {
        &self.preview_proxy
    }

    fn trusted_key_auth(&self) -> &TrustedKeyAuthRuntime {
        &self.trusted_key_auth
    }
}

impl LocalDeployment {
    pub fn workspace_manager(&self) -> &WorkspaceManager {
        &self.workspace_manager
    }

    /// In local-first mode the local user is always the operator — always logged in.
    pub async fn get_login_status(&self) -> LoginStatus {
        LoginStatus::LoggedIn { profile: None }
    }

    pub fn pty(&self) -> &PtyService {
        &self.pty
    }

    pub fn ssh_config(&self) -> &Arc<russh::server::Config> {
        &self.ssh_config
    }

    pub fn trigger_pr_sync(&self) {
        self.pr_sync_notify.notify_one();
    }
}
