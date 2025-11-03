use axum::{
    Router,
    extract::{Json, Request, State},
    http::StatusCode,
    middleware::{Next, from_fn_with_state},
    response::{Json as ResponseJson, Response},
    routing::post,
};
use chrono::{DateTime, Utc};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use services::services::clerk::ClerkSession;
use utils::response::ApiResponse;

use crate::{DeploymentImpl, error::ApiError};

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route(
            "/auth/clerk/session",
            post(set_clerk_session).delete(clear_clerk_session),
        )
        .layer(from_fn_with_state(
            deployment.clone(),
            sentry_user_context_middleware,
        ))
}

#[derive(Debug, Deserialize)]
struct ClerkSessionRequest {
    token: String,
}

#[derive(Debug, Serialize)]
struct ClerkSessionResponse {
    user_id: String,
    organization_id: Option<String>,
    session_id: String,
    expires_at: DateTime<Utc>,
}

async fn set_clerk_session(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<ClerkSessionRequest>,
) -> Result<ResponseJson<ApiResponse<ClerkSessionResponse>>, ApiError> {
    let Some(auth) = deployment.clerk_auth() else {
        return Err(ApiError::Conflict(
            "Clerk authentication is not configured".to_string(),
        ));
    };

    let token = payload.token.trim();
    if token.is_empty() {
        return Err(ApiError::Unauthorized);
    }

    let identity = match auth.verify(token).await {
        Ok(identity) => identity,
        Err(err) => {
            tracing::warn!(?err, "failed to verify Clerk session during registration");
            return Err(ApiError::Unauthorized);
        }
    };

    let session = ClerkSession::from_parts(token.to_string(), identity);
    deployment.clerk_sessions().set(session.clone()).await;

    let mut identify_props = serde_json::json!({
        "clerk_user_id": session.user_id.clone(),
    });
    if let Some(props) = identify_props.as_object_mut() {
        if let Some(org_id) = &session.org_id {
            props.insert("clerk_org_id".to_string(), serde_json::json!(org_id));
        }
        if let Some(org_slug) = &session.org_slug {
            props.insert("clerk_org_slug".to_string(), serde_json::json!(org_slug));
        }
    }

    deployment
        .track_if_analytics_allowed("$identify", identify_props)
        .await;

    let response = ClerkSessionResponse {
        user_id: session.user_id.clone(),
        organization_id: session.org_id.clone(),
        session_id: session.session_id.clone(),
        expires_at: session.expires_at,
    };

    Ok(ResponseJson(ApiResponse::success(response)))
}

async fn clear_clerk_session(State(deployment): State<DeploymentImpl>) -> StatusCode {
    deployment.clerk_sessions().clear().await;
    StatusCode::NO_CONTENT
}

/// Middleware to set Sentry user context for every request
pub async fn sentry_user_context_middleware(
    State(deployment): State<DeploymentImpl>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let _ = deployment.update_sentry_scope().await;
    Ok(next.run(req).await)
}
