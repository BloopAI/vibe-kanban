//! Generate one-time auth codes for relay browser-session exchange.

use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use relay_types::CreateRemoteSessionResponse;
use uuid::Uuid;

use super::super::{
    auth::RequestContext,
    db::{
        hosts::HostRepository, identity_errors::IdentityError,
        relay_browser_sessions::RelayBrowserSessionRepository,
    },
    state::RelayAppState,
};

pub async fn create_relay_session(
    State(state): State<RelayAppState>,
    Path(host_id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<CreateRemoteSessionResponse>, Response> {
    let host_repo = HostRepository::new(&state.pool);
    if let Err(error) = host_repo.assert_host_access(host_id, ctx.user.id).await {
        return Err(match error {
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                (StatusCode::FORBIDDEN, "Host access denied").into_response()
            }
            IdentityError::Database(db_error) => {
                tracing::warn!(?db_error, "failed to validate host access");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
        });
    }

    let relay_browser_session_repo = RelayBrowserSessionRepository::new(&state.pool);
    let relay_browser_session = match relay_browser_session_repo
        .create(host_id, ctx.user.id, ctx.session_id)
        .await
    {
        Ok(session) => session,
        Err(error) => {
            tracing::warn!(?error, "failed to create relay browser session");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to generate auth code",
            )
                .into_response());
        }
    };
    Ok(Json(CreateRemoteSessionResponse {
        session_id: relay_browser_session.id,
    }))
}
