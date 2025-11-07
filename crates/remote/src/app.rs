use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use tracing::instrument;

use crate::{
    AppState,
    activity::ActivityBroker,
    auth::{DeviceFlowService, GitHubDeviceProvider, JwtService, ProviderRegistry},
    config::RemoteServerConfig,
    db, routes,
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

        let broker = ActivityBroker::new(
            config.activity_broadcast_shards,
            config.activity_broadcast_capacity,
        );
        let auth_config = config.auth.clone();
        let jwt = Arc::new(JwtService::new(auth_config.jwt_secret().clone()));

        let mut registry = ProviderRegistry::new();
        let github_provider = GitHubDeviceProvider::new(
            auth_config.github_client_id().to_string(),
            auth_config.github_client_secret().clone(),
        )?;
        registry.register(github_provider);
        let registry = Arc::new(registry);

        let device_flow = Arc::new(DeviceFlowService::new(
            pool.clone(),
            registry.clone(),
            jwt.clone(),
        ));

        let state = AppState::new(
            pool.clone(),
            broker.clone(),
            config.clone(),
            jwt,
            device_flow,
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
