use anyhow::{self, Error as AnyhowError};
use axum::Router;
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, preview_proxy, routes};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
    browser::open_browser,
    port_file::write_port_file_with_proxy,
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
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_utils::init_once(SentrySource::Backend);

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level},codex_core=off",
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

    // Copy old database to new location for safe downgrades
    let old_db = asset_dir().join("db.sqlite");
    let new_db = asset_dir().join("db.v2.sqlite");
    if !new_db.exists() && old_db.exists() {
        tracing::info!(
            "Copying database to new location: {:?} -> {:?}",
            old_db,
            new_db
        );
        std::fs::copy(&old_db, &new_db).expect("Failed to copy database file");
        tracing::info!("Database copy complete");
    }

    let deployment = DeploymentImpl::new().await?;
    deployment.update_sentry_scope().await?;
    deployment
        .container()
        .cleanup_orphan_executions()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_before_head_commits()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .container()
        .backfill_repo_names()
        .await
        .map_err(DeploymentError::from)?;
    deployment
        .track_if_analytics_allowed("session_start", serde_json::json!({}))
        .await;
    // Preload global executor options cache for all executors with DEFAULT presets
    tokio::spawn(async move {
        executors::executors::utils::preload_global_executor_options_cache().await;
    });
    let app_router = routes::router(deployment.clone());

    let port = std::env::var("BACKEND_PORT")
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|s| {
            // Remove any ANSI codes, then turn into String
            let cleaned =
                String::from_utf8(strip(s.as_bytes())).expect("UTF-8 after stripping ANSI");
            cleaned.trim().parse::<u16>().ok()
        })
        .unwrap_or_else(|| {
            tracing::info!("No PORT environment variable set, using port 0 for auto-assignment");
            0
        }); // Use 0 to find free port if no specific port provided

    let proxy_port = std::env::var("PREVIEW_PROXY_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .unwrap_or(0);

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

    let main_listener = tokio::net::TcpListener::bind(format!("{host}:{port}")).await?;
    let actual_main_port = main_listener.local_addr()?.port();

    let proxy_listener = tokio::net::TcpListener::bind(format!("{host}:{proxy_port}")).await?;
    let actual_proxy_port = proxy_listener.local_addr()?.port();

    preview_proxy::set_proxy_port(actual_proxy_port);

    if let Err(e) = write_port_file_with_proxy(actual_main_port, Some(actual_proxy_port)).await {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!(
        "Main server on :{}, Preview proxy on :{}",
        actual_main_port,
        actual_proxy_port
    );

    // Production only: open browser
    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        let browser_port = actual_main_port;
        tokio::spawn(async move {
            if let Err(e) = open_browser(&format!("http://127.0.0.1:{browser_port}")).await {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    browser_port
                );
            }
        });
    }

    let proxy_router: Router = preview_proxy::router();
    let shutdown_token = CancellationToken::new();

    let main_shutdown = shutdown_token.clone();
    let proxy_shutdown = shutdown_token.clone();

    let main_server = axum::serve(main_listener, app_router)
        .with_graceful_shutdown(async move { main_shutdown.cancelled().await });
    let proxy_server = axum::serve(proxy_listener, proxy_router)
        .with_graceful_shutdown(async move { proxy_shutdown.cancelled().await });

    let main_handle = tokio::spawn(async move {
        if let Err(e) = main_server.await {
            tracing::error!("Main server error: {}", e);
        }
    });
    let proxy_handle = tokio::spawn(async move {
        if let Err(e) = proxy_server.await {
            tracing::error!("Preview proxy error: {}", e);
        }
    });

    tokio::select! {
        _ = shutdown_signal() => {
            tracing::info!("Shutdown signal received");
        }
        _ = main_handle => {}
        _ = proxy_handle => {}
    }

    shutdown_token.cancel();

    perform_cleanup_actions(&deployment).await;

    Ok(())
}

pub async fn shutdown_signal() {
    // Always wait for Ctrl+C
    let ctrl_c = async {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::error!("Failed to install Ctrl+C handler: {e}");
        }
    };

    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};

        // Try to install SIGTERM handler, but don't panic if it fails
        let terminate = async {
            if let Ok(mut sigterm) = signal(SignalKind::terminate()) {
                sigterm.recv().await;
            } else {
                tracing::error!("Failed to install SIGTERM handler");
                // Fallback: never resolves
                std::future::pending::<()>().await;
            }
        };

        tokio::select! {
            _ = ctrl_c => {},
            _ = terminate => {},
        }
    }

    #[cfg(not(unix))]
    {
        // Only ctrl_c is available, so just await it
        ctrl_c.await;
    }
}

pub async fn perform_cleanup_actions(deployment: &DeploymentImpl) {
    deployment
        .container()
        .kill_all_running_processes()
        .await
        .expect("Failed to cleanly kill running execution processes");
}
