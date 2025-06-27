use std::str::FromStr;

use directories::ProjectDirs;
use rmcp::{transport::stdio, ServiceExt};
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use vibe_kanban::{mcp::task_server::TaskServer, utils::asset_dir};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("debug")
        .with_writer(std::io::stderr)
        .init();

    tracing::debug!("[MCP] Starting MCP task server...");

    // Database connection
    let database_url = format!(
        "sqlite://{}",
        asset_dir().join("db.sqlite").to_string_lossy()
    );

    let options = SqliteConnectOptions::from_str(&database_url)?.create_if_missing(true);
    let pool = SqlitePool::connect_with(options).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;

    let service = TaskServer::new(pool)
        .serve(stdio())
        .await
        .inspect_err(|e| {
            tracing::error!("serving error: {:?}", e);
        })?;

    service.waiting().await?;
    Ok(())
}
