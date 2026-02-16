use deployment::{Deployment, DeploymentError};
use services::services::container::ContainerService;
use tokio_util::sync::CancellationToken;
use utils::assets::asset_dir;

use crate::DeploymentImpl;

/// A running server instance. Callers can read the port, then call `serve()`
/// to run the server until the shutdown token is cancelled.
pub struct ServerHandle {
    pub port: u16,
    pub proxy_port: u16,
    pub deployment: DeploymentImpl,
    shutdown_token: CancellationToken,
    main_listener: tokio::net::TcpListener,
    proxy_listener: tokio::net::TcpListener,
}

impl ServerHandle {
    /// The base URL the main server is listening on.
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }

    /// Run both the main and proxy servers until the shutdown token is cancelled.
    pub async fn serve(self) -> anyhow::Result<()> {
        let app_router = crate::routes::router(self.deployment.clone());
        let proxy_router: axum::Router = crate::preview_proxy::router();

        let main_shutdown = self.shutdown_token.clone();
        let proxy_shutdown = self.shutdown_token.clone();

        let main_server = axum::serve(self.main_listener, app_router)
            .with_graceful_shutdown(async move { main_shutdown.cancelled().await });
        let proxy_server = axum::serve(self.proxy_listener, proxy_router)
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
            _ = main_handle => {}
            _ = proxy_handle => {}
        }

        perform_cleanup_actions(&self.deployment).await;
        Ok(())
    }

    /// Return a clone of the shutdown token. Cancel it to stop `serve()`.
    pub fn shutdown_token(&self) -> CancellationToken {
        self.shutdown_token.clone()
    }
}

/// Initialize the deployment, bind listeners on `127.0.0.1` with OS-assigned
/// ports, and return a handle that is ready to serve.
pub async fn start() -> anyhow::Result<ServerHandle> {
    start_with_bind("127.0.0.1:0", "127.0.0.1:0").await
}

/// Like [`start`], but lets the caller specify the bind addresses for the main
/// server and the preview proxy (e.g. `"0.0.0.0:8080"`).
pub async fn start_with_bind(main_addr: &str, proxy_addr: &str) -> anyhow::Result<ServerHandle> {
    let deployment = initialize_deployment().await?;

    let listener = tokio::net::TcpListener::bind(main_addr).await?;
    let port = listener.local_addr()?.port();

    let proxy_listener = tokio::net::TcpListener::bind(proxy_addr).await?;
    let proxy_port = proxy_listener.local_addr()?.port();
    crate::preview_proxy::set_proxy_port(proxy_port);

    tracing::info!("Server on :{port}, Preview proxy on :{proxy_port}");

    Ok(ServerHandle {
        port,
        proxy_port,
        deployment,
        shutdown_token: CancellationToken::new(),
        main_listener: listener,
        proxy_listener,
    })
}

/// Initialize the deployment: create asset directory, run migrations, backfill data,
/// and pre-warm caches. Shared between the standalone server and the Tauri app.
pub async fn initialize_deployment() -> Result<DeploymentImpl, DeploymentError> {
    // Create asset directory if it doesn't exist
    if !asset_dir().exists() {
        std::fs::create_dir_all(asset_dir()).map_err(|e| {
            DeploymentError::Other(anyhow::anyhow!("Failed to create asset directory: {}", e))
        })?;
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

    Ok(deployment)
}

/// Gracefully shut down running execution processes.
pub async fn perform_cleanup_actions(deployment: &DeploymentImpl) {
    deployment
        .container()
        .kill_all_running_processes()
        .await
        .expect("Failed to cleanly kill running execution processes");
}
