use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::db::identity_errors::IdentityError;

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
