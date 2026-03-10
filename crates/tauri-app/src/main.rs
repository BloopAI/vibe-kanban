// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use async_trait::async_trait;
use services::services::notification::{PushNotifier, set_global_push_notifier};
use tauri::{Emitter, Listener, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;
use uuid::Uuid;

/// Native push notifier using Tauri's notification plugin.
/// Emits a `navigate-to-workspace` event so the frontend can navigate to the
/// relevant workspace when the user clicks the notification and the app activates.
struct TauriNotifier {
    app_handle: tauri::AppHandle,
}

#[async_trait]
impl PushNotifier for TauriNotifier {
    async fn send(&self, title: &str, message: &str, workspace_id: Option<Uuid>) {
        if let Err(e) = self
            .app_handle
            .notification()
            .builder()
            .title(title)
            .body(message)
            .show()
        {
            tracing::warn!("Failed to send Tauri notification: {}", e);
        }

        if let Some(id) = workspace_id {
            let _ = self.app_handle.emit(
                "navigate-to-workspace",
                serde_json::json!({ "workspaceId": id.to_string() }),
            );
        }
    }
}

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

    // Shared token so we can tell the server to shut down when the app quits.
    let shutdown_token = Arc::new(CancellationToken::new());
    let shutdown_token_for_event = shutdown_token.clone();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init());

    // Only register the updater plugin in release builds — dev builds have a
    // placeholder endpoint that fails config deserialization.
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(move |app| {
            if cfg!(debug_assertions) {
                // Dev mode: frontend dev server (Vite) and backend are started
                // externally. Create the window immediately pointing to devUrl.
                tracing::info!("Running in dev mode — using external frontend/backend servers");
                create_window(app, tauri::WebviewUrl::App("index.html".into()))?;
            } else {
                // Production: start the Axum server first, then open the window
                // once it's ready so the user never sees a blank/error page.
                let app_handle = app.handle().clone();

                // Register native Tauri notifications before the server starts.
                set_global_push_notifier(Arc::new(TauriNotifier {
                    app_handle: app_handle.clone(),
                }));

                let token = shutdown_token.clone();
                tauri::async_runtime::spawn(async move {
                    match server::startup::start().await {
                        Ok(server_handle) => {
                            let url = server_handle.url();

                            // Create the window on the main thread — macOS
                            // silently drops windows created from async tasks.
                            let url_clone = url.clone();
                            let create_handle = app_handle.clone();
                            let _ = app_handle.run_on_main_thread(move || {
                                let webview_url =
                                    tauri::WebviewUrl::External(url_clone.parse().unwrap());
                                match create_window(&create_handle, webview_url) {
                                    Ok(_) => {}
                                    Err(e) => tracing::error!("Failed to create window: {e}"),
                                }
                            });
                            tracing::info!("Window opened at {url}");

                            // Wait for either the server to exit on its own or
                            // the external shutdown token to be cancelled.
                            let server_token = server_handle.shutdown_token();
                            tauri::async_runtime::spawn(async move {
                                token.cancelled().await;
                                server_token.cancel();
                            });

                            if let Err(e) = server_handle.serve().await {
                                tracing::error!("Server error: {e}");
                            }
                        }
                        Err(e) => {
                            tracing::error!("Server failed to start: {e}");
                        }
                    }
                });

                // Check for updates in the background
                let update_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    check_for_updates(update_handle).await;
                });

                // Listen for restart request from frontend (after update installed).
                let restart_handle = app.handle().clone();
                app.listen("restart-app", move |_| {
                    restart_handle.restart();
                });
            }

            Ok(())
        })
        .on_window_event(move |window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    // Hide the window instead of closing it so the app keeps
                    // running in the background (agents/processes stay alive).
                    // The dock icon stays visible so users can click it to reopen.
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Destroyed => {
                    // Only fires on actual app exit (e.g. Cmd+Q).
                    shutdown_token_for_event.cancel();
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {
            // macOS: clicking the dock icon when the window is hidden should reopen it.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                show_window(_app);
            }
        });
}

fn show_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn create_window<R: tauri::Runtime, M: tauri::Manager<R>>(
    manager: &M,
    url: tauri::WebviewUrl,
) -> Result<tauri::WebviewWindow<R>, tauri::Error> {
    let handle = manager.app_handle().clone();
    let mut builder = tauri::WebviewWindowBuilder::new(manager, "main", url)
        .title("Vibe Kanban")
        .inner_size(1280.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .resizable(true)
        .zoom_hotkeys_enabled(true)
        .disable_drag_drop_handler();

    // macOS: overlay title bar keeps traffic lights but removes title bar chrome,
    // letting web content extend to the top of the window.
    // Traffic lights are vertically centered within the navbar height (~28px).
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(12.0, 10.0));
    }

    // Windows/Linux: remove native decorations entirely.
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false);
    }

    builder
        .on_new_window(move |url, _features| {
            tracing::info!("New window requested for URL: {}", url);
            let url_str = url.to_string();
            let _ = handle.opener().open_url(&url_str, None::<&str>);
            tauri::webview::NewWindowResponse::Deny
        })
        .build()
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

            let new_version = update.version.to_string();
            match update.download_and_install(|_, _| {}, || {}).await {
                Ok(_) => {
                    tracing::info!("Update installed successfully, restart required");
                    let _ = app.emit(
                        "update-installed",
                        serde_json::json!({ "newVersion": new_version }),
                    );
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
