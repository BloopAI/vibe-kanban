use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{JwtService, OAuthHandoffService, OAuthTokenValidator, ProviderRegistry},
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
    pub handoff: Arc<OAuthHandoffService>,
    pub oauth_token_validator: Arc<OAuthTokenValidator>,
}

impl AppState {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: PgPool,
        broker: ActivityBroker,
        config: RemoteServerConfig,
        jwt: Arc<JwtService>,
        handoff: Arc<OAuthHandoffService>,
        oauth_token_validator: Arc<OAuthTokenValidator>,
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
            oauth_token_validator,
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

    pub fn providers(&self) -> Arc<ProviderRegistry> {
        self.handoff.providers()
    }

    pub fn oauth_token_validator(&self) -> Arc<OAuthTokenValidator> {
        Arc::clone(&self.oauth_token_validator)
    }
}
