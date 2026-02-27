use std::sync::Arc;

use relay_tunnel::server_bin::{
    auth::JwtService, config::RelayServerConfig, db, routes, state::RelayAppState,
};
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialise tracing
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(fmt::layer())
        .init();

    // Force rustls crypto provider (same as remote)
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let config = RelayServerConfig::from_env()?;
    tracing::info!(
        listen_addr = %config.listen_addr,
        "Starting relay server"
    );

    let pool = db::create_pool(&config.database_url).await?;
    tracing::debug!("Database pool created");

    let jwt = Arc::new(JwtService::new(config.jwt_secret.clone()));
    let state = RelayAppState::new(pool, config.clone(), jwt);

    let router = routes::build_router(state);

    let listener = tokio::net::TcpListener::bind(&config.listen_addr).await?;
    tracing::info!("Relay server listening on {}", config.listen_addr);

    axum::serve(listener, router).await?;

    Ok(())
}
