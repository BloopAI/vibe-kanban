// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use tauri::Emitter;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::oneshot;
use tracing_subscriber::EnvFilter;

fn main() {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::aws_lc_rs::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    let log_level = std::env::var("RUST_LOG").unwrap_or_else(|_| "info".to_string());
    let filter_string = format!(
        "warn,server={level},services={level},db={level},executors={level},deployment={level},local_deployment={level},utils={level},vibe_kanban_tauri={level}",
        level = log_level
    );
    let env_filter = EnvFilter::try_new(filter_string).expect("Failed to create tracing filter");
    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    // Channel to signal the server to shut down when the window closes
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let shutdown_tx = Arc::new(std::sync::Mutex::new(Some(shutdown_tx)));
    let shutdown_tx_clone = shutdown_tx.clone();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init());

    // Only register the updater plugin in release builds — dev builds have a
    // placeholder endpoint that fails config deserialization.
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            let handle = app.handle().clone();

            if cfg!(debug_assertions) {
                // Dev mode: frontend dev server (Vite) and backend are started
                // externally. Create the window immediately pointing to devUrl.
                tracing::info!("Running in dev mode — using external frontend/backend servers");
                create_window(app, tauri::WebviewUrl::App("index.html".into()))?;
                drop(shutdown_rx);
            } else {
                // Production: start the Axum server first, then open the window
                // once it's ready so the user never sees a blank/error page.
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    match start_server(shutdown_rx).await {
                        Ok((url, server_future)) => {
                            let webview_url = tauri::WebviewUrl::External(url.parse().unwrap());
                            match create_window(&app_handle, webview_url) {
                                Ok(_) => {
                                    tracing::info!("Window opened at {url}");
                                }
                                Err(e) => {
                                    tracing::error!("Failed to create window: {e}");
                                }
                            }

                            // Run the server until shutdown
                            if let Err(e) = server_future.await {
                                tracing::error!("Server error: {e}");
                            }
                        }
                        Err(e) => {
                            tracing::error!("Server failed to start: {e}");
                        }
                    }
                });

                // Check for updates in the background
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_updates(handle).await;
                });
            }

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(tx) = shutdown_tx_clone.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

<<<<<<< HEAD
async fn run_server(
    window: tauri::WebviewWindow,
    shutdown_rx: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let handle = server::startup::start().await?;

    let url = handle.url();
    tracing::info!("Server running on {url}");

    // Navigate the webview to the server URL
    if let Err(e) = window.eval(&format!("window.location.replace('{url}')")) {
        tracing::error!("Failed to navigate webview: {}", e);
    }

    // When the window closes, cancel the server's shutdown token
    let shutdown_token = handle.shutdown_token();
    tauri::async_runtime::spawn(async move {
        let _ = shutdown_rx.await;
        tracing::info!("Shutdown signal received, stopping server...");
        shutdown_token.cancel();
    });

    handle.serve().await?;

    Ok(())
=======
fn create_window<M: tauri::Manager>(
    manager: &M,
    url: tauri::WebviewUrl,
) -> Result<tauri::WebviewWindow, tauri::Error> {
    let handle = manager.app_handle().clone();
    tauri::WebviewWindowBuilder::new(manager, "main", url)
        .title("Vibe Kanban")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .zoom_hotkeys_enabled(true)
        .on_new_window(move |url, _features| {
            tracing::info!("New window requested for URL: {}", url);
            let url_str = url.to_string();
            let _ = handle.opener().open_url(&url_str, None::<&str>);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
}

/// Start the Axum server and return the URL + a future that runs it.
async fn start_server(
    shutdown_rx: oneshot::Receiver<()>,
) -> anyhow::Result<(
    String,
    impl std::future::Future<Output = anyhow::Result<()>>,
)> {
    let deployment = server::startup::initialize_deployment().await?;
    let app_router = server::routes::router(deployment.clone());

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    let url = format!("http://127.0.0.1:{port}");

    tracing::info!("Server running on {url}");

    let server_future = async move {
        axum::serve(listener, app_router)
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
                tracing::info!("Shutdown signal received, stopping server...");
            })
            .await?;
        server::startup::perform_cleanup_actions(&deployment).await;
        Ok(())
    };

    Ok((url, server_future))
>>>>>>> 026c48f5b (fix: delay window creation until server is ready)
}

async fn check_for_updates(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(e) => {
            tracing::warn!("Failed to initialize updater: {}", e);
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            tracing::info!(
                "Update available: {} -> {}",
                update.current_version,
                update.version
            );

            let _ = app.emit(
                "update-available",
                serde_json::json!({
                    "currentVersion": update.current_version.to_string(),
                    "newVersion": update.version.to_string(),
                    "body": update.body
                }),
            );

            match update.download_and_install(|_, _| {}, || {}).await {
                Ok(_) => {
                    tracing::info!("Update installed successfully, restart required");
                    let _ = app.emit("update-installed", ());
                }
                Err(e) => {
                    tracing::error!("Failed to install update: {}", e);
                }
            }
        }
        Ok(None) => {
            tracing::info!("No updates available");
        }
        Err(e) => {
            tracing::warn!("Failed to check for updates: {}", e);
        }
    }
}
