use directories::ProjectDirs;
use rmcp::{transport::stdio, ServiceExt};
use sqlx::{sqlite::SqliteConnectOptions, SqlitePool};
use std::str::FromStr;

use vibe_kanban::mcp::task_server::TaskServer;

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

fn asset_dir() -> std::path::PathBuf {
    let proj = if cfg!(debug_assertions) {
        ProjectDirs::from("ai", "bloop-dev", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    } else {
        ProjectDirs::from("ai", "bloop", env!("CARGO_PKG_NAME"))
            .expect("OS didn't give us a home directory")
    };

    proj.data_dir().to_path_buf()
}
