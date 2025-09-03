use anyhow::{self, Error as AnyhowError};
use deployment::{Deployment, DeploymentError};
use db::models::project::Project;
use server::{DeploymentImpl, routes};
use sqlx::Error as SqlxError;
use std::path::PathBuf;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir, browser::open_browser, port_file::write_port_file, sentry::sentry_layer,
};

#[derive(Debug, Error)]
pub enum VibeKanbanError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Sqlx(#[from] SqlxError),
    #[error(transparent)]
    Deployment(#[from] DeploymentError),
    #[error(transparent)]
    Other(#[from] AnyhowError),
}

#[tokio::main]
async fn main() -> Result<(), VibeKanbanError> {
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level}",
        level = log_level
    );
    let env_filter = EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer().with_filter(env_filter))
        .with(sentry_layer())
        .init();

    // Create asset directory if it doesn't exist
    if !asset_dir().exists() {
        std::fs::create_dir_all(asset_dir())?;
    }

    let deployment = DeploymentImpl::new().await?;
    deployment.update_sentry_scope().await?;
    deployment.cleanup_orphan_executions().await?;
    deployment.spawn_pr_monitor_service().await;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;

    // Pre-warm file search cache for most active projects
    let deployment_for_cache = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = warm_file_search_cache(&deployment_for_cache).await {
            tracing::warn!("Failed to warm file search cache: {}", e);
        }
    });

    let app_router = routes::router(deployment);

    let port = std::env::var("BACKEND_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| {
            // remove any ANSI codes, then turn into String
            let cleaned =
                String::from_utf8(strip(s.as_bytes())).expect("UTF-8 after stripping ANSI");
            cleaned.trim().parse::<u16>().ok()
        })
        .unwrap_or_else(|| {
            tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
            0
        }); // Use 0 to find free port if no specific port provided

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    let actual_port = listener.local_addr()?.port(); // get → 53427 (example)

    // Write port file for discovery if prod, warn on fail
    if !cfg!(debug_assertions)
        && let Err(e) = write_port_file(actual_port).await
    {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!("Server running on http://{host}:{actual_port}");

    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        if let Err(e) = open_browser(&format!("http://127.0.0.1:{actual_port}")).await {
            tracing::warn!(
                "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                e,
                actual_port
            );
        }
    }

    axum::serve(listener, app_router).await?;
    Ok(())
}

async fn warm_file_search_cache(deployment: &DeploymentImpl) -> Result<(), String> {
    tracing::info!("Starting file search cache warming...");
    
    // Get top 3 most active projects
    let active_projects = Project::find_most_active(&deployment.db().pool, 3)
        .await
        .map_err(|e| format!("Failed to fetch active projects: {}", e))?;
    
    if active_projects.is_empty() {
        tracing::info!("No active projects found, skipping cache warming");
        return Ok(());
    }
    
    let repo_paths: Vec<PathBuf> = active_projects
        .iter()
        .map(|p| PathBuf::from(&p.git_repo_path))
        .collect();
    
    tracing::info!("Warming cache for {} projects: {:?}", repo_paths.len(), repo_paths);
    
    let file_search_cache = deployment.file_search_cache();
    file_search_cache.warm_repos(repo_paths.clone()).await
        .map_err(|e| format!("Failed to warm cache: {}", e))?;
    
    // Setup watchers for active projects
    for repo_path in &repo_paths {
        if let Err(e) = file_search_cache.setup_watcher(repo_path).await {
            tracing::warn!("Failed to setup watcher for {:?}: {}", repo_path, e);
        }
    }
    
    tracing::info!("File search cache warming completed");
    Ok(())
}
