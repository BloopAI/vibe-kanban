use anyhow::{self, Error as AnyhowError};
use axum::Router;
use clap::Parser;
use deployment::{Deployment, DeploymentError};
use server::{
    DeploymentImpl, middleware::origin::validate_origin, routes, runtime::relay_registration,
};
use services::services::container::ContainerService;
use sqlx::Error as SqlxError;
use strip_ansi_escapes::strip;
use thiserror::Error;
use tokio_util::sync::CancellationToken;
use tower_http::validate_request::ValidateRequestHeaderLayer;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    assets::asset_dir,
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

#[derive(Parser, Debug)]
#[command(name = "vibe-kanban", about = "Run the Vibe Kanban server")]
struct Cli {
    /// Port to bind the backend server to. Overrides BACKEND_PORT/PORT env vars.
    #[arg(long, value_name = "PORT", value_parser = parse_port)]
    port: Option<u16>,

    /// Host interface to bind to. Overrides HOST env var.
    #[arg(long, value_name = "HOST")]
    host: Option<String>,

    /// Port for the preview proxy server. Overrides PREVIEW_PROXY_PORT env var.
    #[arg(long, value_name = "PORT", value_parser = parse_port)]
    preview_proxy_port: Option<u16>,
}

/// CLI env vars to strip from the process so they don't leak to child processes
/// (coding agents, dev servers). Stripped after parsing, before the tokio runtime starts.
const CLI_ENV_VARS: &[&str] = &[
    "PORT",
    "BACKEND_PORT",
    "HOST",
    "FRONTEND_PORT",
    "PREVIEW_PROXY_PORT",
];

fn main() -> Result<(), VibeKanbanError> {
    let cli = Cli::parse();

    let port = cli
        .port
        .or_else(|| read_port_from_env("BACKEND_PORT"))
        .or_else(|| read_port_from_env("PORT"))
        .unwrap_or(0);

    let host = cli
        .host
        .or_else(|| std::env::var("HOST").ok().map(|s| s.trim().to_string()))
        .unwrap_or_else(|| "127.0.0.1".to_string());

    let proxy_port = cli
        .preview_proxy_port
        .or_else(|| read_port_from_env("PREVIEW_PROXY_PORT"))
        .unwrap_or(0);

    for var in CLI_ENV_VARS {
        unsafe { std::env::remove_var(var) };
    }

    let main_listener = std::net::TcpListener::bind(format!("{host}:{port}"))?;
    let proxy_listener = std::net::TcpListener::bind(format!("{host}:{proxy_port}"))?;
    main_listener.set_nonblocking(true)?;
    proxy_listener.set_nonblocking(true)?;

    unsafe {
        std::env::set_var(
            "VIBE_BACKEND_URL",
            format!("http://{}:{}", host, main_listener.local_addr()?.port()),
        );
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("Failed to build tokio runtime")
        .block_on(async_main(main_listener, proxy_listener))
}

async fn async_main(
    main_std_listener: std::net::TcpListener,
    proxy_std_listener: std::net::TcpListener,
) -> Result<(), VibeKanbanError> {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    sentry_utils::init_once(SentrySource::Backend);

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level},embedded_ssh={level},desktop_bridge={level},relay_hosts={level},relay_client={level},relay_webrtc={level},codex_core=off",
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

    let shutdown_token = CancellationToken::new();

    let deployment = DeploymentImpl::new(shutdown_token.clone()).await?;
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

    let main_listener = tokio::net::TcpListener::from_std(main_std_listener)?;
    let actual_main_port = main_listener.local_addr()?.port();

    let proxy_listener = tokio::net::TcpListener::from_std(proxy_std_listener)?;
    let actual_proxy_port = proxy_listener.local_addr()?.port();

    if let Err(e) = write_port_file_with_proxy(actual_main_port, Some(actual_proxy_port)).await {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!(
        "Main server on :{}, Preview proxy on :{}",
        actual_main_port,
        actual_proxy_port
    );

    deployment
        .client_info()
        .set_server_addr(main_listener.local_addr()?)
        .expect("client server address already set");
    deployment
        .client_info()
        .set_preview_proxy_port(actual_proxy_port)
        .expect("client preview proxy port already set");

    let app_router = routes::router(deployment.clone());

    // Production only: open browser
    if !cfg!(debug_assertions) {
        tracing::info!("Opening browser...");
        let browser_port = actual_main_port;
        tokio::spawn(async move {
            if let Err(e) =
                utils::browser::open_browser(&format!("http://127.0.0.1:{browser_port}")).await
            {
                tracing::warn!(
                    "Failed to open browser automatically: {}. Please open http://127.0.0.1:{} manually.",
                    e,
                    browser_port
                );
            }
        });
    }

    let proxy_router: Router = routes::preview::subdomain_router(deployment.clone())
        .layer(ValidateRequestHeaderLayer::custom(validate_origin));

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

    relay_registration::spawn_relay(&deployment).await;

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

fn parse_port(value: &str) -> Result<u16, String> {
    let cleaned =
        String::from_utf8(strip(value.as_bytes())).map_err(|_| "value is not valid UTF-8")?;
    let trimmed = cleaned.trim();
    trimmed
        .parse::<u16>()
        .map_err(|err| format!("invalid port '{trimmed}': {err}"))
}

fn read_port_from_env(name: &str) -> Option<u16> {
    std::env::var(name)
        .ok()
        .and_then(|value| match parse_port(&value) {
            Ok(port) => Some(port),
            Err(err) => {
                eprintln!("Ignoring invalid {name} value '{value}': {err}");
                None
            }
        })
}
