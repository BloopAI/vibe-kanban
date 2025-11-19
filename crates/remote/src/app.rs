use std::{net::SocketAddr, sync::Arc};

use anyhow::{Context, bail};
use tracing::instrument;

use crate::{
    AppState,
    activity::ActivityBroker,
    auth::{
        GitHubOAuthProvider, GoogleOAuthProvider, JwtService, OAuthHandoffService, ProviderRegistry,
    },
    config::RemoteServerConfig,
    db,
    mail::LoopsMailer,
    routes,
};

pub struct Server;

impl Server {
    #[instrument(
        name = "remote_server",
        skip(config),
        fields(listen_addr = %config.listen_addr, activity_channel = %config.activity_channel)
    )]
    pub async fn run(config: RemoteServerConfig) -> anyhow::Result<()> {
        let pool = db::create_pool(&config.database_url)
            .await
            .context("failed to create postgres pool")?;

        db::migrate(&pool)
            .await
            .context("failed to run database migrations")?;

        db::maintenance::spawn_activity_partition_maintenance(pool.clone());

        let broker = ActivityBroker::new(
            config.activity_broadcast_shards,
            config.activity_broadcast_capacity,
        );
        let auth_config = config.auth.clone();
        let jwt = Arc::new(JwtService::new(auth_config.jwt_secret().clone()));

        let mut registry = ProviderRegistry::new();

        if let Some(github) = auth_config.github() {
            registry.register(GitHubOAuthProvider::new(
                github.client_id().to_string(),
                github.client_secret().clone(),
            )?);
        }

        if let Some(google) = auth_config.google() {
            registry.register(GoogleOAuthProvider::new(
                google.client_id().to_string(),
                google.client_secret().clone(),
            )?);
        }

        if registry.is_empty() {
            bail!("no OAuth providers configured");
        }

        let registry = Arc::new(registry);

        let handoff_service = Arc::new(OAuthHandoffService::new(
            pool.clone(),
            registry.clone(),
            jwt.clone(),
            auth_config.public_base_url().to_string(),
        ));

        let api_key = std::env::var("LOOPS_EMAIL_API_KEY")
            .context("LOOPS_EMAIL_API_KEY environment variable is required")?;
        let mailer = Arc::new(LoopsMailer::new(api_key));

        let server_public_base_url = config.server_public_base_url.clone().ok_or_else(|| {
            anyhow::anyhow!(
                "SERVER_PUBLIC_BASE_URL is not set. Please set it in your .env.remote file."
            )
        })?;

        let state = AppState::new(
            pool.clone(),
            broker.clone(),
            config.clone(),
            jwt,
            handoff_service,
            mailer,
            server_public_base_url,
        );

        let listener =
            db::ActivityListener::new(pool.clone(), broker, config.activity_channel.clone());
        tokio::spawn(listener.run());

        let router = routes::router(state);
        let addr: SocketAddr = config
            .listen_addr
            .parse()
            .context("listen address is invalid")?;
        let tcp_listener = tokio::net::TcpListener::bind(addr)
            .await
            .context("failed to bind tcp listener")?;

        tracing::info!(%addr, "shared sync server listening");

        let make_service = router.into_make_service();

        axum::serve(tcp_listener, make_service)
            .await
            .context("shared sync server failure")?;

        Ok(())
    }
}
