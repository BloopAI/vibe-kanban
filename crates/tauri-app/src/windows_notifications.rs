//! Windows notification system using `tauri-winrt-notification`.
//!
//! Bypasses `tauri-plugin-notification` (which has no desktop click handling)
//! and uses WinRT toast notifications directly. The `on_activated` callback
//! fires when the user clicks the notification body, then emits a Tauri event
//! so the frontend can navigate.

use std::sync::OnceLock;

use tauri::{Emitter, Manager};
use tauri_winrt_notification::Toast;

/// Global app handle so the `on_activated` callback can emit events.
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

/// App User Model ID used for toast notifications.
/// Must match the identifier in `tauri.conf.json` for production builds.
/// Falls back to PowerShell's AUMID in dev builds (where the app isn't
/// installed and has no registered AUMID).
fn app_id() -> &'static str {
    if cfg!(debug_assertions) {
        Toast::POWERSHELL_APP_ID
    } else {
        "ai.bloop.vibe-kanban"
    }
}

pub fn initialize(app_handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

pub fn is_available() -> bool {
    APP_HANDLE.get().is_some()
}

pub fn show_notification(title: &str, body: &str, deeplink_path: Option<&str>) {
    let path = deeplink_path.map(|s| s.to_string());

    let result = Toast::new(app_id())
        .title(title)
        .text1(body)
        .on_activated(move |_action| {
            if let Some(handle) = APP_HANDLE.get() {
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                if let Some(ref p) = path {
                    let _ = handle.emit(
                        "notification-clicked",
                        serde_json::json!({ "deeplinkPath": p }),
                    );
                }
            }
            Ok(())
        })
        .show();

    if let Err(e) = result {
        tracing::warn!("Failed to show Windows notification: {e}");
    }
}
