use std::str::FromStr;

use rmcp::{transport::stdio, ServiceExt};
use server::mcp::task_server::TaskServer;
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use tracing_subscriber::{prelude::*, EnvFilter};
use utils::{assets::asset_dir, sentry::sentry_layer};

fn main() -> anyhow::Result<()> {
    let environment = if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    };
    let _guard = sentry::init(("https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937", sentry::ClientOptions {
        release: sentry::release_name!(),
        environment: Some(environment.into()),
        ..Default::default()
    }));
    sentry::configure_scope(|scope| {
        scope.set_tag("source", "mcp");
    });
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                        .with_filter(EnvFilter::new("debug")),
                )
                .with(sentry_layer())
                .init();

            tracing::debug!("[MCP] Starting MCP task server...");

            // Database connection
            let database_url = format!(
                "sqlite://{}",
                asset_dir().join("db.sqlite").to_string_lossy()
            );

            let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(false);
            let pool = SqlitePool::connect_with(options).await?;

            let service = TaskServer::new(pool)
                .serve(stdio())
                .await
                .inspect_err(|e| {
                    tracing::error!("serving error: {:?}", e);
                    sentry::capture_error(e);
                })?;

            service.waiting().await?;
            Ok(())
        })
}
