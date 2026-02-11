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

pub(crate) fn db_error(
    error: impl std::error::Error + 'static,
    fallback_message: &str,
) -> ErrorResponse {
    let error: &(dyn std::error::Error + 'static) = &error;
    let mut current = Some(error);

    while let Some(err) = current {
        if let Some(sqlx_error) = err.downcast_ref::<sqlx::Error>() {
            if let sqlx::Error::Database(db_err) = sqlx_error {
                if db_err.is_unique_violation() {
                    return ErrorResponse::new(StatusCode::CONFLICT, "resource already exists");
                }
                if db_err.is_foreign_key_violation() {
                    return ErrorResponse::new(StatusCode::NOT_FOUND, "related resource not found");
                }
            }
            break;
        }
        current = err.source();
    }

    ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, fallback_message)
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
