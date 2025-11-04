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
use services::services::{
    clerk::{ClerkServiceError, ClerkSession, UserIdentity},
    config::{ConfigError, save_config_to_file},
};
use utils::{assets::config_path, response::ApiResponse};

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
    let Some(auth) = deployment.clerk_service() else {
        return Err(ApiError::Conflict(
            "Clerk authentication is not configured".to_string(),
        ));
    };

    let token = payload.token.trim().to_owned();
    if token.is_empty() {
        return Err(ApiError::Unauthorized);
    }

    let identity = match auth.verify(&token).await {
        Ok(identity) => identity,
        Err(err) => {
            tracing::warn!(?err, "failed to verify Clerk session during registration");
            return Err(ApiError::Unauthorized);
        }
    };

    let user_identity = match auth.identify(&token).await {
        Ok(identity) => Some(identity),
        Err(ClerkServiceError::RemoteNotConfigured) => None,
        Err(err) => {
            tracing::warn!(
                ?err,
                "failed to fetch remote identity during Clerk session registration"
            );
            None
        }
    };

    let session = ClerkSession::from_parts(token.clone(), identity.clone());
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
        if let Some(identity) = &user_identity {
            props.insert(
                "email".to_string(),
                serde_json::json!(identity.email.clone()),
            );
            if let Some(username) = &identity.username {
                props.insert("username".to_string(), serde_json::json!(username));
            }
        }
    }

    if let Some(identity) = user_identity.as_ref() {
        if let Err(err) = sync_user_identity(&deployment, identity).await {
            tracing::error!(?err, "failed to sync Clerk identity after login");
        } else if let Err(err) = deployment.update_sentry_scope().await {
            tracing::warn!(?err, "failed to update Sentry scope after Clerk login");
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

/// Synchronize the user identity from Clerk with the local deployment config.
async fn sync_user_identity(
    deployment: &DeploymentImpl,
    identity: &UserIdentity,
) -> Result<(), ConfigError> {
    let mut config = deployment.config().write().await;
    let mut updated = false;

    if config.github.username != identity.username {
        config.github.username = identity.username.clone();
        updated = true;
    }

    if config.github.primary_email.as_deref() != Some(identity.email.as_str()) {
        config.github.primary_email = Some(identity.email.clone());
        updated = true;
    }

    if updated {
        let snapshot = config.clone();
        drop(config);
        let config_path = config_path();
        save_config_to_file(&snapshot, &config_path).await?;
    } else {
        drop(config);
    }

    Ok(())
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
