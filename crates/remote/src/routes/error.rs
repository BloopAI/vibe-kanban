use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::json;

use crate::{
    auth::ClerkServiceError,
    db::{identity::IdentityError, projects::ProjectError, tasks::SharedTaskError},
};

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
        IdentityError::Clerk(err) => {
            tracing::debug!(?err, "clerk refused identity lookup");
            (StatusCode::BAD_REQUEST, Json(json!({ "error": message })))
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

pub(crate) fn clerk_token_error_response(error: ClerkServiceError) -> Response {
    match error {
        ClerkServiceError::NotFound(_) | ClerkServiceError::OAuthTokenUnavailable(_) => (
            StatusCode::PRECONDITION_FAILED,
            Json(json!({ "error": "github account not linked" })),
        ),
        ClerkServiceError::InvalidResponse(err) => {
            tracing::error!(?err, "failed to parse Clerk OAuth token response");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "failed to retrieve GitHub token" })),
            )
        }
        ClerkServiceError::Http(err) => {
            tracing::error!(?err, "failed to call Clerk OAuth token endpoint");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "failed to retrieve GitHub token" })),
            )
        }
    }
    .into_response()
}
