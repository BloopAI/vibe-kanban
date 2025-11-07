use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::DBService;
use deployment::{Deployment, DeploymentError};
use executors::profile::ExecutorConfigs;
use services::services::{
    analytics::{AnalyticsConfig, AnalyticsContext, AnalyticsService, generate_user_id},
    approvals::Approvals,
    clerk::{ClerkPublicConfig, ClerkPublicConfigError, ClerkService, ClerkSessionStore},
    config::{Config, load_config_from_file, save_config_to_file},
    container::ContainerService,
    drafts::DraftsService,
    events::EventService,
    file_search_cache::FileSearchCache,
    filesystem::FilesystemService,
    git::GitService,
    image::ImageService,
    share::{RemoteSyncHandle, ShareConfig, SharePublisher},
};
use tokio::sync::{Mutex, RwLock};
use utils::{assets::config_path, msg_store::MsgStore};
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
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    container: LocalContainerService,
    git: GitService,
    image: ImageService,
    filesystem: FilesystemService,
    events: EventService,
    file_search_cache: Arc<FileSearchCache>,
    approvals: Approvals,
    drafts: DraftsService,
    share_publisher: Option<SharePublisher>,
    share_sync_handle: Arc<Mutex<Option<RemoteSyncHandle>>>,
    clerk_sessions: ClerkSessionStore,
    clerk_service: Option<Arc<ClerkService>>,
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

        let clerk_sessions = ClerkSessionStore::new();
        let share_config = ShareConfig::from_env();
        let clerk_service = match ClerkPublicConfig::from_env() {
            Ok(public_config) => {
                let remote_api_base = share_config.as_ref().map(|sc| sc.api_base.clone());
                Some(Arc::new(public_config.build_auth(remote_api_base)?))
            }
            Err(ClerkPublicConfigError::MissingEnv(_)) => {
                tracing::error!("CLERK_ISSUER not set; remote features disabled");
                None
            }
            Err(err) => return Err(DeploymentError::Other(err.into())),
        };

        // Populate the handle once the sync task is started
        let share_sync_handle = Arc::new(Mutex::new(None));
        let mut share_publisher: Option<SharePublisher> = None;
        let mut share_sync_config: Option<ShareConfig> = None;

        if let (Some(_), Some(sc_ref)) = (clerk_service.as_ref(), share_config.as_ref()) {
            let sc_owned = sc_ref.clone();
            match SharePublisher::new(
                db.clone(),
                git.clone(),
                sc_owned.clone(),
                clerk_sessions.clone(),
            ) {
                Ok(publisher) => {
                    share_publisher = Some(publisher);
                    share_sync_config = Some(sc_owned);
                }
                Err(err) => {
                    tracing::error!(
                        ?err,
                        "Failed to initialize SharePublisher; disabling share feature"
                    );
                }
            };
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
        );
        container.spawn_worktree_cleanup().await;

        let events = EventService::new(db.clone(), events_msg_store, events_entry_count);

        let drafts = DraftsService::new(db.clone(), image.clone());
        let file_search_cache = Arc::new(FileSearchCache::new());

        let deployment = Self {
            config,
            user_id,
            db,
            analytics,
            msg_stores,
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
            clerk_sessions,
            clerk_service,
        };

        if let Some(sc) = share_sync_config {
            deployment.spawn_remote_sync(sc);
        }

        Ok(deployment)
    }

    fn user_id(&self) -> &str {
        &self.user_id
    }

    fn shared_types() -> Vec<String> {
        vec![]
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

    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>> {
        &self.msg_stores
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

    fn share_publisher(&self) -> Option<SharePublisher> {
        self.share_publisher.clone()
    }

    fn share_sync_handle(&self) -> &Arc<Mutex<Option<RemoteSyncHandle>>> {
        &self.share_sync_handle
    }

    fn clerk_sessions(&self) -> &ClerkSessionStore {
        &self.clerk_sessions
    }

    fn clerk_service(&self) -> Option<Arc<ClerkService>> {
        self.clerk_service.clone()
    }
}
