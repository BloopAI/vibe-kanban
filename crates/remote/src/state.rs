use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{ClerkAuth, ClerkService},
    config::RemoteServerConfig,
};

#[derive(Clone)]
pub struct AppState {
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
            pool,
            broker,
            config,
            auth,
            clerk,
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn broker(&self) -> &ActivityBroker {
        &self.broker
    }

    pub fn config(&self) -> &RemoteServerConfig {
        &self.config
    }

    pub fn auth(&self) -> &ClerkAuth {
        &self.auth
    }

    pub fn clerk(&self) -> &ClerkService {
        &self.clerk
    }
}
