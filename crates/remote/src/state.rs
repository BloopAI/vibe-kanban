use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{JwtService, OAuthHandoffService},
    config::RemoteServerConfig,
    mail::Mailer,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub broker: ActivityBroker,
    pub config: RemoteServerConfig,
    pub jwt: Arc<JwtService>,
    pub mailer: Arc<dyn Mailer>,
    pub server_public_base_url: String,
    handoff: Arc<OAuthHandoffService>,
}

impl AppState {
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        handoff: Arc<OAuthHandoffService>,
        mailer: Arc<dyn Mailer>,
        server_public_base_url: String,
    ) -> Self {
        Self {
            pool,
            broker,
            config,
            jwt,
            mailer,
            server_public_base_url,
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
