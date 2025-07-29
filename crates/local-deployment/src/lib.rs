use std::{collections::HashMap, sync::Arc};

use async_trait::async_trait;
use db::DBService;
use deployment::{Deployment, DeploymentError};
use services::services::{
    analytics::{AnalyticsConfig, AnalyticsService, generate_user_id},
    auth::AuthService,
    config::Config,
    container::ContainerService,
    git::GitService,
    process_service::ProcessService,
    sentry::SentryService,
};
use tokio::sync::RwLock;
use utils::{assets::config_path, msg_store::MsgStore};
use uuid::Uuid;

use crate::container::LocalContainerService;

pub mod container;

#[derive(Clone)]
pub struct LocalDeployment {
    config: Arc<RwLock<Config>>,
    sentry: SentryService,
    user_id: String,
    db: DBService,
    analytics: Option<AnalyticsService>,
    msg_stores: Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>>,
    container: LocalContainerService,
    git: GitService,
    process: ProcessService,
    auth: AuthService,
}

#[async_trait]
impl Deployment for LocalDeployment {
    async fn new() -> Result<Self, DeploymentError> {
        let config = Arc::new(RwLock::new(Config::load(&config_path())?));
        let sentry = SentryService::new();
        let user_id = generate_user_id();
        let db = DBService::new().await?;
        let analytics = AnalyticsConfig::new().map(AnalyticsService::new);
        let git = GitService::new();
        let msg_stores = Arc::new(RwLock::new(HashMap::new()));
        let container = LocalContainerService::new(db.clone(), git.clone(), msg_stores.clone());
        let process = ProcessService::new();
        let auth = AuthService::new();

        Ok(Self {
            config,
            sentry,
            user_id,
            db,
            analytics,
            msg_stores,
            container,
            git,
            process,
            auth,
        })
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

    fn sentry(&self) -> &SentryService {
        &self.sentry
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
    fn auth(&self) -> &AuthService {
        &self.auth
    }

    fn git(&self) -> &GitService {
        &self.git
    }

    fn msg_stores(&self) -> &Arc<RwLock<HashMap<Uuid, Arc<MsgStore>>>> {
        &self.msg_stores
    }
}
