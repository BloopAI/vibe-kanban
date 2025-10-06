use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker, auth::ClerkAuth, clerk::ClerkService, config::RemoteServerConfig,
};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pool: PgPool,
    broker: ActivityBroker,
    config: RemoteServerConfig,
    auth: ClerkAuth,
    clerk: ClerkService,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        auth: ClerkAuth,
        clerk: ClerkService,
    ) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                pool,
                broker,
                config,
                auth,
                clerk,
            }),
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.inner.pool
    }

    pub fn broker(&self) -> &ActivityBroker {
        &self.inner.broker
    }

    pub fn config(&self) -> &RemoteServerConfig {
        &self.inner.config
    }

    pub fn auth(&self) -> &ClerkAuth {
        &self.inner.auth
    }

    pub fn clerk(&self) -> &ClerkService {
        &self.inner.clerk
    }
}
