use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use api_types::{ListRelayHostsResponse, RelaySession};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        hosts::HostRepository,
        identity_errors::IdentityError,
    },
};

const RELAY_SESSION_TTL_SECS: i64 = 120;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct CreateRelaySessionResponse {
    pub session: RelaySession,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/hosts", get(list_hosts))
        .route("/hosts/{host_id}/sessions", post(create_relay_session))
}

async fn list_hosts(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ListRelayHostsResponse>, ErrorResponse> {
    let repo = HostRepository::new(state.pool());
    let hosts = repo.list_accessible_hosts(ctx.user.id).await.map_err(|error| {
        tracing::warn!(?error, "failed to list relay hosts");
        ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to list hosts")
    })?;

    Ok(Json(ListRelayHostsResponse { hosts }))
}

async fn create_relay_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Path(host_id): Path<Uuid>,
) -> Result<Json<CreateRelaySessionResponse>, ErrorResponse> {
    let repo = HostRepository::new(state.pool());

    repo.assert_host_access(host_id, ctx.user.id)
        .await
        .map_err(|error| match error {
            IdentityError::Database(_) => {
                ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error")
            }
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied")
            }
            _ => ErrorResponse::new(StatusCode::FORBIDDEN, "Access denied"),
        })?;

    let expires_at = Utc::now() + Duration::seconds(RELAY_SESSION_TTL_SECS);
    let session = repo
        .create_session(host_id, ctx.user.id, expires_at)
        .await
        .map_err(|_| {
            ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session")
        })?;

    if let Some(analytics) = state.analytics() {
        analytics.track(
            ctx.user.id,
            "relay_host_session_created",
            serde_json::json!({
                "host_id": host_id,
                "relay_session_id": session.id,
            }),
        );
    }

    Ok(Json(CreateRelaySessionResponse { session }))
}
