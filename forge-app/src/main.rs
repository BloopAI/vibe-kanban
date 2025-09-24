//! Forge Application
//!
//! Main application binary that composes upstream services with forge extensions.
//! Provides unified API access to both upstream functionality and forge-specific features.

use std::{env, net::SocketAddr};
use tracing_subscriber;

mod router;
mod services;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Initialize database and forge services
    let database_url =
        env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite:./forge.sqlite".to_string());

    tracing::info!(
        "Initializing forge services with database: {}",
        database_url
    );
    let services = services::ForgeServices::new(&database_url).await?;

    // Create router with services
    let app = router::create_router(services);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8887));
    tracing::info!("Forge app listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
