use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::db::{identity_errors::IdentityError, projects::ProjectError, tasks::SharedTaskError};

#[derive(Debug)]
pub struct ErrorResponse {
    status: StatusCode,
    message: String,
}

impl ErrorResponse {
    pub fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ErrorResponse {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

pub(crate) fn task_error_response(error: SharedTaskError, context: &str) -> Response {
    let response = match error {
        SharedTaskError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "task not found" })),
        ),
        SharedTaskError::Forbidden => (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "only the assignee can modify this task" })),
        ),
        SharedTaskError::Conflict(message) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        SharedTaskError::PayloadTooLarge => (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "title and description cannot exceed 50 KiB combined"
            })),
        ),
        SharedTaskError::Project(ProjectError::Conflict(message)) => {
            (StatusCode::CONFLICT, Json(json!({ "error": message })))
        }
        SharedTaskError::Project(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
        SharedTaskError::Identity(err) => return identity_error_response(err, context),
        SharedTaskError::Serialization(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "failed to serialize shared task" })),
            )
        }
        SharedTaskError::Database(err) => {
            tracing::error!(?err, "{context}", context = context);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    };

    response.into_response()
}

pub(crate) fn identity_error_response(error: IdentityError, message: &str) -> Response {
    match error {
        IdentityError::NotFound => (StatusCode::BAD_REQUEST, Json(json!({ "error": message }))),
        IdentityError::PermissionDenied => (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "permission denied" })),
        ),
        IdentityError::InvitationError(msg) => {
            (StatusCode::BAD_REQUEST, Json(json!({ "error": msg })))
        }
        IdentityError::CannotDeleteOrganization(msg) => {
            (StatusCode::CONFLICT, Json(json!({ "error": msg })))
        }
        IdentityError::OrganizationConflict(msg) => {
            (StatusCode::CONFLICT, Json(json!({ "error": msg })))
        }
        IdentityError::Database(err) => {
            tracing::error!(?err, "identity sync failed");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "internal server error" })),
            )
        }
    }
    .into_response()
}

pub(crate) fn membership_error(error: IdentityError, forbidden_message: &str) -> ErrorResponse {
    match error {
        IdentityError::NotFound | IdentityError::PermissionDenied => {
            ErrorResponse::new(StatusCode::FORBIDDEN, forbidden_message)
        }
        IdentityError::Database(_) => {
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
        }
        other => {
            tracing::warn!(?other, "unexpected membership error");
            ErrorResponse::new(StatusCode::FORBIDDEN, forbidden_message)
        }
    }
}
