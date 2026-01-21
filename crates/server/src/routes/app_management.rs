use axum::{
    Json, Router,
    extract::State,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use utils::api::ApiResponse;
use utils::desktop::{self, DesktopError};

use crate::DeploymentImpl;

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        .route("/exit", post(exit_app))
        .route("/desktop-shortcut", post(create_desktop_shortcut))
        .route("/desktop-shortcut-exists", get(desktop_shortcut_exists))
}

/// Request body for exit app
#[derive(Debug, Deserialize, TS)]
pub struct ExitAppRequest {
    /// Whether to show confirmation before exiting (not used for now)
    #[serde(default)]
    pub force: bool,
}

/// Response for desktop shortcut operations
#[derive(Debug, Serialize, Deserialize, TS)]
pub struct DesktopShortcutResponse {
    pub success: bool,
    pub message: String,
    pub path: Option<String>,
    pub already_exists: bool,
}

/// Exit the application
async fn exit_app(State(_deployment): State<DeploymentImpl>) -> Response {
    // Trigger graceful shutdown via global flag
    crate::main::request_shutdown();

    // Return success response immediately
    // The actual shutdown will happen in the background
    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        Json(ApiResponse::<()>::success_with_message(
            "Application is shutting down...",
        )),
    )
        .into_response()
}

/// Create a desktop shortcut
async fn create_desktop_shortcut(
    State(_deployment): State<DeploymentImpl>,
) -> Response {
    // Check if shortcut already exists
    let already_exists = desktop::desktop_shortcut_exists();

    let result = desktop::create_desktop_shortcut();

    match result {
        Ok(path) => {
            let message = if already_exists {
                "Desktop shortcut replaced successfully".to_string()
            } else {
                "Desktop shortcut created successfully".to_string()
            };

            (
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                Json(ApiResponse::success(DesktopShortcutResponse {
                    success: true,
                    message,
                    path: Some(path.to_string_lossy().to_string()),
                    already_exists,
                })),
            )
                .into_response()
        }
        Err(e) => {
            tracing::error!("Failed to create desktop shortcut: {}", e);

            let error_message = match e {
                DesktopError::HomeNotFound => {
                    "Could not find home directory".to_string()
                }
                DesktopError::ExePathNotFound => {
                    "Could not find executable path".to_string()
                }
                DesktopError::Io(io_err) => {
                    format!("IO error: {}", io_err)
                }
            };

            (
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                Json(ApiResponse::<DesktopShortcutResponse>::error(&error_message)),
            )
                .into_response()
        }
    }
}

/// Check if desktop shortcut exists
async fn desktop_shortcut_exists(
    State(_deployment): State<DeploymentImpl>,
) -> Response {
    let exists = desktop::desktop_shortcut_exists();

    (
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        Json(ApiResponse::success(DesktopShortcutResponse {
            success: true,
            message: if exists {
                "Desktop shortcut exists".to_string()
            } else {
                "Desktop shortcut does not exist".to_string()
            },
            path: None,
            already_exists: exists,
        })),
    )
        .into_response()
}
