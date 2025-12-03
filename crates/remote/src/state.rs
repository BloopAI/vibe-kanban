use std::sync::Arc;

use sqlx::PgPool;

use crate::{
    activity::ActivityBroker,
    auth::{
        ConnectionTokenService, JwtService, OAuthHandoffService, OAuthTokenValidator,
        ProviderRegistry,
    },
    config::RemoteServerConfig,
    mail::Mailer,
    nodes::ConnectionManager,
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
    pub node_connections: ConnectionManager,
    pub connection_token: Arc<ConnectionTokenService>,
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
        node_connections: ConnectionManager,
        connection_token: Arc<ConnectionTokenService>,
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
            node_connections,
            connection_token,
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

    pub fn node_connections(&self) -> &ConnectionManager {
        &self.node_connections
    }

    pub fn connection_token(&self) -> Arc<ConnectionTokenService> {
        Arc::clone(&self.connection_token)
    }
}
