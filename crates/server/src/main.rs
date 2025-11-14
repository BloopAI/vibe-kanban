use anyhow::{self, Error as AnyhowError};
use db::models::execution_process::{ExecutionProcess, ExecutionProcessStatus};
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, routes};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tokio::sync::watch;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
    browser::open_browser,
    port_file::write_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
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
    sentry_utils::init_once(SentrySource::Backend);

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
    deployment.backfill_before_head_commits().await?;
    deployment.spawn_pr_monitor_service().await;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;

    // Pre-warm file search cache for most active projects
    let deployment_for_cache = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_cache
            .file_search_cache()
            .warm_most_active(&deployment_for_cache.db().pool, 3)
            .await
        {
            tracing::warn!("Failed to warm file search cache: {}", e);
        }
    });

    let app_router = routes::router(deployment.clone());

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
    if let Err(e) = write_port_file(actual_port).await {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!("Server running on http://{host}:{actual_port}");

    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        tokio::spawn(async move {
            if let Err(e) = open_browser(&format!("http://127.0.0.1:{actual_port}")).await {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    actual_port
                );
            }
        });
    }

    // Set up signal handlers for graceful shutdown
    let (shutdown_tx, shutdown_rx) = watch::channel(false);

    let shutdown_signal_task = tokio::spawn({
        let shutdown_tx = shutdown_tx;
        async move {
            shutdown_signal().await;
            let _ = shutdown_tx.send(true);
        }
    });

    let mut cleanup_shutdown_rx = shutdown_rx.clone();
    let deployment_for_shutdown = deployment.clone();
    let cleanup_handle = tokio::spawn(async move {
        wait_for_shutdown(&mut cleanup_shutdown_rx).await;
        tracing::info!("Shutdown signal received, stopping dev servers...");

        // Find all running dev servers
        match ExecutionProcess::find_all_running_dev_servers(&deployment_for_shutdown.db().pool)
            .await
        {
            Ok(dev_servers) => {
                if !dev_servers.is_empty() {
                    tracing::info!("Stopping {} running dev server(s)...", dev_servers.len());
                    for dev_server in dev_servers {
                        if let Err(e) = deployment_for_shutdown
                            .container()
                            .stop_execution(&dev_server, ExecutionProcessStatus::Killed)
                            .await
                        {
                            tracing::error!("Failed to stop dev server {}: {}", dev_server.id, e);
                        } else {
                            tracing::info!("Stopped dev server {}", dev_server.id);
                        }
                    }
                    tracing::info!("All dev servers stopped");
                } else {
                    tracing::info!("No running dev servers to stop");
                }
            }
            Err(e) => {
                tracing::error!("Failed to find running dev servers: {}", e);
            }
        }
    });

    let mut server_shutdown_rx = shutdown_rx.clone();
    axum::serve(listener, app_router)
        .with_graceful_shutdown(async move {
            wait_for_shutdown(&mut server_shutdown_rx).await;
        })
        .await?;

    cleanup_handle
        .await
        .map_err(|err| VibeKanbanError::Other(err.into()))?;
    shutdown_signal_task
        .await
        .map_err(|err| VibeKanbanError::Other(err.into()))?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}

async fn wait_for_shutdown(rx: &mut watch::Receiver<bool>) {
    if *rx.borrow() {
        return;
    }

    let _ = rx.changed().await;
}
