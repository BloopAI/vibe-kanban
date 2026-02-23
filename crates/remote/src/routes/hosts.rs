use axum::{
    Json, Router,
    extract::{Extension, Path, State},
    http::StatusCode,
    routing::{get, post},
};
use api_types::{CreateRelayHostRequest, ListRelayHostsResponse, RelayHost};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::error::ErrorResponse;
use crate::{
    AppState,
    auth::RequestContext,
    db::{
        hosts::{HostRepository, RelaySession},
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
        .route("/hosts", get(list_hosts).post(create_host))
        .route("/hosts/{host_id}/sessions", post(create_relay_session))
}

async fn list_hosts(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<ListRelayHostsResponse>, ErrorResponse> {
    let repo = HostRepository::new(state.pool());
    let hosts = repo
        .list_accessible_hosts(ctx.user.id)
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Database error"))?;

    Ok(Json(ListRelayHostsResponse { hosts }))
}

async fn create_host(
    State(state): State<AppState>,
    Extension(ctx): Extension<RequestContext>,
    Json(payload): Json<CreateRelayHostRequest>,
) -> Result<(StatusCode, Json<RelayHost>), ErrorResponse> {
    let name = payload.name.trim();
    if name.is_empty() || name.len() > 200 {
        return Err(ErrorResponse::new(
            StatusCode::BAD_REQUEST,
            "Host name must be between 1 and 200 characters",
        ));
    }

    let repo = HostRepository::new(state.pool());
    let host = repo
        .create_host(ctx.user.id, name, payload.agent_version.as_deref())
        .await
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create host"))?;

    Ok((
        StatusCode::CREATED,
        Json(RelayHost {
            id: host.id,
            owner_user_id: host.owner_user_id,
            name: host.name,
            status: host.status,
            last_seen_at: host.last_seen_at,
            agent_version: host.agent_version,
            created_at: host.created_at,
            updated_at: host.updated_at,
            access_role: "owner".to_string(),
        }),
    ))
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
        .map_err(|_| ErrorResponse::new(StatusCode::INTERNAL_SERVER_ERROR, "Failed to create session"))?;

    Ok(Json(CreateRelaySessionResponse { session }))
}
