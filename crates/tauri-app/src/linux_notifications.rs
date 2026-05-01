//! Linux notification system using `notify-rust`.
//!
//! Bypasses `tauri-plugin-notification` (which has no desktop click handling)
//! and uses `notify-rust` directly with the D-Bus `ActionInvoked` signal.
//! A `"default"` action is registered so clicking the notification body
//! triggers the callback, which emits a Tauri event for frontend navigation.

use std::sync::OnceLock;

use notify_rust::Notification;
use tauri::{Emitter, Manager};

/// Global app handle so the click callback can emit events.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

pub fn initialize(app_handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

pub fn is_available() -> bool {
    APP_HANDLE.get().is_some()
}

pub fn show_notification(title: &str, body: &str, deeplink_path: Option<&str>) {
    let path = deeplink_path.map(|s| s.to_string());
    let title = title.to_string();
    let body = body.to_string();

    // `wait_for_action` blocks until the user interacts with the notification,
    // so we spawn a dedicated thread for each notification.
    std::thread::spawn(move || {
        let handle = Notification::new()
            .summary(&title)
            .body(&body)
            .action("default", "default")
            .show();

        match handle {
            Ok(handle) => {
                handle.wait_for_action(|action| {
                    if action == "default"
                        && let Some(app) = APP_HANDLE.get()
                    {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        if let Some(ref p) = path {
                            let _ = app.emit(
                                "notification-clicked",
                                serde_json::json!({ "deeplinkPath": p }),
                            );
                        }
                    }
                });
            }
            Err(e) => tracing::warn!("Failed to show Linux notification: {e}"),
        }
    });
}
