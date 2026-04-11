use anyhow::{self, Error as AnyhowError};
use db::models::task::Task;
use deployment::{Deployment, DeploymentError};
use server::{DeploymentImpl, file_logging, routes};
use services::services::container::ContainerService;
use services::services::log_migration::recover_incomplete_executions;
use sqlx::Error as SqlxError;
use std::process::{Child, Command, Stdio};
use strip_ansi_escapes::strip;
use thiserror::Error;
use utils::{
    assets::{asset_dir, backup_dir, database_path},
    browser::open_browser,
    port_file::{InstanceInfo, InstancePorts, InstanceRegistry, write_port_file},
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

/// Ensure all directories required by the current configuration exist.
///
/// This runs early in startup so missing directories are caught before any
/// database connections or file operations are attempted.  Each path function
/// already creates the directory when a custom env var is set; calling them
/// here makes the failure visible immediately (rather than at first use) and
/// also handles the `asset_dir` creation in a single, consistent place.
fn ensure_configured_dirs() -> Result<(), VibeKanbanError> {
    // asset_dir() creates itself inside the function; call it to ensure it exists.
    let _ = asset_dir();

    // database_path() creates its parent dir when VK_DATABASE_PATH is set.
    let db = database_path();
    if let Some(parent) = db.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| {
                std::io::Error::new(
                    e.kind(),
                    format!("Failed to create database directory '{}': {}", parent.display(), e),
                )
            })?;
        }
    }

    // backup_dir() creates itself when VK_BACKUP_DIR is set; also ensure the
    // default path exists so first-run backups never fail.
    let bd = backup_dir();
    std::fs::create_dir_all(&bd).map_err(|e| {
        std::io::Error::new(
            e.kind(),
            format!("Failed to create backup directory '{}': {}", bd.display(), e),
        )
    })?;

    // VK_WORKTREE_DIR is created inside WorktreeManager::get_worktree_base_dir()
    // when the env var is set.  Trigger it here so any failure surfaces at startup.
    let worktree_dir = services::services::worktree_manager::WorktreeManager::get_worktree_base_dir();
    std::fs::create_dir_all(&worktree_dir).map_err(|e| {
        std::io::Error::new(
            e.kind(),
            format!(
                "Failed to create worktree directory '{}': {}",
                worktree_dir.display(),
                e
            ),
        )
    })?;

    // VK_LOG_DIR — create it unconditionally so it is ready whether or not file
    // logging is currently enabled (the user may enable it later without restart).
    let log_dir = std::env::var("VK_LOG_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| asset_dir().join("logs"));
    std::fs::create_dir_all(&log_dir).map_err(|e| {
        std::io::Error::new(
            e.kind(),
            format!("Failed to create log directory '{}': {}", log_dir.display(), e),
        )
    })?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), VibeKanbanError> {
    // Load .env file if present (for development)
    dotenvy::dotenv().ok();

    // Initialize logging (console + optional file logging)
    // The guard must be held for the lifetime of the application to ensure logs are flushed
    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let _file_log_guard = file_logging::init_logging(&log_level);

    // Ensure all configured directories exist at startup.
    // These calls trigger directory creation for any paths set via environment
    // variables (VK_DATABASE_PATH, VK_BACKUP_DIR, VK_WORKTREE_DIR, VK_LOG_DIR).
    // Failures here produce clear errors before any DB connections are attempted.
    ensure_configured_dirs()?;

    // Clean up stale instance registry entries from previous runs
    if let Err(e) = InstanceRegistry::cleanup_stale().await {
        tracing::warn!("Failed to cleanup stale instance entries: {}", e);
    }

    let deployment = DeploymentImpl::new().await?;

    // Spawn cleanup operations in background (non-blocking startup)
    let deployment_for_orphan_cleanup = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_orphan_cleanup
            .container()
            .cleanup_orphan_executions()
            .await
        {
            tracing::warn!("Failed to cleanup orphan executions: {}", e);
        }
    });

    let deployment_for_backfill = deployment.clone();
    tokio::spawn(async move {
        if let Err(e) = deployment_for_backfill
            .container()
            .backfill_before_head_commits()
            .await
        {
            tracing::warn!("Failed to backfill before_head_commits: {}", e);
        }
    });

    deployment.spawn_pr_monitor_service().await;
    deployment.spawn_github_sync_service().await;

    // Spawn periodic normalization metrics logger (logs every 5 minutes if there's activity)
    deployment
        .container()
        .normalization_metrics()
        .spawn_periodic_logger();

    // Clean up orphaned shared task IDs (tasks shared to Hive but project no longer linked)
    match Task::clear_orphaned_shared_task_ids(&deployment.db().pool).await {
        Ok(count) if count > 0 => {
            tracing::info!("Cleared {} orphaned shared_task_id(s) from tasks", count);
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!("Failed to clear orphaned shared_task_ids: {}", e);
        }
    }

    // Recover incomplete execution logs from previous server shutdown
    // This migrates logs from JSONL backup (execution_process_logs) to log_entries
    match recover_incomplete_executions(&deployment.db().pool).await {
        Ok(result) if result.executions_processed > 0 => {
            tracing::info!(
                "Recovered {} execution(s) with {} log entries",
                result.executions_processed,
                result.total_migrated
            );
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!("Failed to recover incomplete execution logs: {}", e);
        }
    }

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

    let app_router = routes::router(deployment.clone()).await;

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

    // Determine project root for instance registration
    let project_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));

    // Parse optional ports from environment
    let frontend_port = std::env::var("FRONTEND_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok());
    let mcp_port = std::env::var("MCP_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok());

    // Register instance with all ports for multi-instance support
    let mut instance = InstanceInfo::new(project_root.clone());
    instance.ports = InstancePorts {
        backend: Some(actual_port),
        frontend: frontend_port,
        mcp: mcp_port,
        hive: None, // Set later if hive is enabled
    };
    if let Err(e) = InstanceRegistry::register(&instance).await {
        tracing::warn!("Failed to register instance: {}", e);
    }

    // Also write legacy port file for backwards compatibility
    if let Err(e) = write_port_file(actual_port).await {
        tracing::warn!("Failed to write port file: {}", e);
    }

    tracing::info!("Server running on http://{host}:{actual_port}");

    // Spawn MCP HTTP server if MCP_PORT is set
    let mut mcp_child = spawn_mcp_http_server(actual_port, &host);

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

    // IMPORTANT: Cleanup database BEFORE killing MCP
    // MCP uses HTTP to communicate with backend (which is now down), so it's safe to cleanup first.
    // This ensures all database writes are flushed before any child processes are killed.
    perform_cleanup_actions(&deployment).await;

    // Unregister this instance from the registry
    if let Err(e) = InstanceRegistry::unregister(&project_root).await {
        tracing::warn!("Failed to unregister instance: {}", e);
    }

    // THEN terminate MCP child process (after database is safely closed)
    if let Some(ref mut child) = mcp_child {
        tracing::info!("[MCP] Terminating HTTP server (PID: {})", child.id());
        if let Err(e) = child.kill() {
            tracing::warn!("[MCP] Failed to kill HTTP server: {}", e);
        } else {
            // Wait for the child to fully exit
            let _ = child.wait();
            tracing::info!("[MCP] HTTP server terminated");
        }
    }

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
    // Flush all pending log buffers FIRST to prevent data loss
    if let Some(log_batcher) = deployment.container().log_batcher() {
        tracing::info!("Flushing pending log buffers...");
        log_batcher.shutdown().await;
        tracing::info!("Log buffers flushed");
    }

    // Kill running execution processes (this does DB writes)
    // Skip if VK_DISABLE_PROCESS_KILL_ON_SHUTDOWN is set - useful for worktree dev servers
    // that shouldn't be managing executor processes (the production server manages them)
    if std::env::var("VK_DISABLE_PROCESS_KILL_ON_SHUTDOWN").is_ok() {
        tracing::info!(
            "Skipping process kill on shutdown (VK_DISABLE_PROCESS_KILL_ON_SHUTDOWN is set)"
        );
    } else if let Err(e) = deployment.container().kill_all_running_processes().await {
        tracing::error!("Failed to cleanly kill running execution processes: {}", e);
    }

    // Run TRUNCATE checkpoint to ensure all WAL content is written to main database.
    // This is critical for data durability - if the server is killed after this point,
    // the database will be in a consistent state.
    tracing::info!("Running final WAL checkpoint...");
    match sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(&deployment.db().pool)
        .await
    {
        Ok(_) => {
            tracing::info!("Final WAL checkpoint completed - all data flushed to main database")
        }
        Err(e) => tracing::warn!(
            "Final WAL checkpoint failed (data may still be in WAL): {}",
            e
        ),
    }

    // Close the pool gracefully to ensure all connections are properly closed
    tracing::info!("Closing database connection pool...");
    deployment.db().pool.close().await;
    tracing::info!("Database connection pool closed");
}

/// Spawns the MCP HTTP server as a child process if MCP_PORT is set.
/// Returns the child process handle for cleanup on shutdown.
pub fn spawn_mcp_http_server(backend_port: u16, host: &str) -> Option<Child> {
    let mcp_port = match std::env::var("MCP_PORT") {
        Ok(port_str) => match port_str.trim().parse::<u16>() {
            Ok(port) => port,
            Err(e) => {
                tracing::warn!("Invalid MCP_PORT value '{}': {}", port_str, e);
                return None;
            }
        },
        Err(_) => return None,
    };

    let backend_url = format!("http://{}:{}", host, backend_port);
    let mcp_url = format!("http://{}:{}/mcp", host, mcp_port);

    // Find the vks-mcp-server binary - check debug and release paths
    let binary_path = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .map(|dir| dir.join("vks-mcp-server"))
        .filter(|path| path.exists());

    let binary_path = match binary_path {
        Some(path) => path,
        None => {
            tracing::warn!(
                "[MCP] vks-mcp-server binary not found. Build with: cargo build --bin vks-mcp-server"
            );
            return None;
        }
    };

    tracing::info!("[MCP] Spawning HTTP server at {}", mcp_url);

    match Command::new(&binary_path)
        .args(["--http", "--port", &mcp_port.to_string()])
        .env("VIBE_BACKEND_URL", &backend_url)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(child) => {
            tracing::info!("[MCP] HTTP server started (PID: {})", child.id());
            Some(child)
        }
        Err(e) => {
            tracing::error!("[MCP] Failed to spawn HTTP server: {}", e);
            None
        }
    }
}
