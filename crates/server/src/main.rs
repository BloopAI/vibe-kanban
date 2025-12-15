use anyhow::{self, Error as AnyhowError};
use clap::Parser;
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, routes};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
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

#[derive(Parser, Debug)]
#[command(
    name = "vibe-kanban",
    about = "Run the Vibe Kanban server",
    version,
    author,
    disable_help_subcommand = true
)]
struct Cli {
    /// Port to bind the backend server to. Overrides BACKEND_PORT/PORT when provided.
    #[arg(long, value_name = "PORT", value_parser = parse_port)]
    port: Option<u16>,
    /// Host interface to bind to. Reads from HOST env when set.
    #[arg(long, value_name = "HOST", env = "HOST", value_parser = parse_host)]
    host: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), VibeKanbanError> {
    let cli = Cli::parse();

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

    // Verify shared tasks in background
    let deployment_for_verification = deployment.clone();
    tokio::spawn(async move {
        if let Some(publisher) = deployment_for_verification.container().share_publisher()
            && let Err(e) = publisher.cleanup_shared_tasks().await
        {
            tracing::warn!("Failed to verify shared tasks: {}", e);
        }
    });

    let app_router = routes::router(deployment.clone());

    let port = cli
        .port
        .or_else(|| read_port_from_env("BACKEND_PORT"))
        .or_else(|| read_port_from_env("PORT"))
        .unwrap_or_else(|| {
            tracing::info!("No port provided via CLI or env, using 0 for auto-assignment");
            0
        }); // Use 0 to find free port if no specific port provided

    let host = cli.host.unwrap_or_else(|| "127.0.0.1".to_string());
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

    axum::serve(listener, app_router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

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

fn parse_port(value: &str) -> Result<u16, String> {
    let cleaned =
        String::from_utf8(strip(value.as_bytes())).map_err(|_| "value is not valid UTF-8")?;
    let trimmed = cleaned.trim();
    trimmed
        .parse::<u16>()
        .map_err(|err| format!("invalid port '{trimmed}': {err}"))
}

fn parse_host(value: &str) -> Result<String, String> {
    let cleaned =
        String::from_utf8(strip(value.as_bytes())).map_err(|_| "value is not valid UTF-8")?;
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        Err("host cannot be empty".to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn read_port_from_env(name: &str) -> Option<u16> {
    std::env::var(name)
        .ok()
        .and_then(|value| match parse_port(&value) {
            Ok(port) => Some(port),
            Err(err) => {
                tracing::warn!("Ignoring invalid {name} value '{value}': {err}");
                None
            }
        })
}
