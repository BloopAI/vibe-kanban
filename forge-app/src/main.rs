//! Forge Application
//!
//! Main application binary that composes upstream services with forge extensions.
//! Provides unified API access to both upstream functionality and forge-specific features.

use std::net::SocketAddr;
use tracing_subscriber;

mod router;
mod services;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Initialize upstream deployment and forge services
    tracing::info!("Initializing forge services using upstream deployment");
    let services = services::ForgeServices::new().await?;

    // Create router with services
    let app = router::create_router(services);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8887));
    tracing::info!("Forge app listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
