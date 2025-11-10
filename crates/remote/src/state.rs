use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{JwtService, OAuthHandoffService},
    config::RemoteServerConfig,
};

#[derive(Clone)]
pub struct AppState {
    pool: PgPool,
    broker: ActivityBroker,
    config: RemoteServerConfig,
    jwt: Arc<JwtService>,
    handoff: Arc<OAuthHandoffService>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        handoff: Arc<OAuthHandoffService>,
    ) -> Self {
        Self {
            pool,
            broker,
            config,
            jwt,
            handoff,
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

    pub fn jwt(&self) -> Arc<JwtService> {
        Arc::clone(&self.jwt)
    }

    pub fn handoff(&self) -> Arc<OAuthHandoffService> {
        Arc::clone(&self.handoff)
    }
}
