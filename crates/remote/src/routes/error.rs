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
