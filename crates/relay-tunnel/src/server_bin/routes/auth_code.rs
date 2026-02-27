//! Generate one-time auth codes for relay browser-session exchange.

use api_types::RelaySessionAuthCodeResponse;
use axum::{
    Extension, Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use chrono::Utc;
use uuid::Uuid;

use super::super::{
    auth::RequestContext,
    db::{
        hosts::HostRepository, relay_auth_codes::RelayAuthCodeRepository,
        relay_browser_sessions::RelayBrowserSessionRepository,
    },
    state::RelayAppState,
};

/// Generate a one-time auth code for a relay browser-session exchange.
pub async fn relay_session_auth_code(
    State(state): State<RelayAppState>,
    Path(session_id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<RelaySessionAuthCodeResponse>, Response> {
    let repo = HostRepository::new(&state.pool);
    let session = match repo
        .get_session_for_requester(session_id, ctx.user.id)
        .await
    {
        Ok(Some(session)) => session,
        Ok(None) => return Err((StatusCode::NOT_FOUND, "Relay session not found").into_response()),
        Err(error) => {
            tracing::warn!(?error, "failed to load relay session");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    if session.ended_at.is_some() || session.state == "expired" {
        return Err((StatusCode::GONE, "Relay session expired").into_response());
    }

    if session.expires_at <= Utc::now() {
        if let Err(error) = repo.mark_session_expired(session.id).await {
            tracing::warn!(?error, "failed to mark relay session expired");
        }
        return Err((StatusCode::GONE, "Relay session expired").into_response());
    }

    // Check in-memory registry — the relay-server knows exactly which hosts are connected
    if state.relay_registry.get(&session.host_id).await.is_none() {
        return Err((StatusCode::NOT_FOUND, "Host is not connected").into_response());
    }

    if let Err(error) = repo.mark_session_active(session.id).await {
        tracing::warn!(?error, "failed to mark relay session active");
        return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    let relay_browser_session_repo = RelayBrowserSessionRepository::new(&state.pool);
    let relay_browser_session = match relay_browser_session_repo
        .create(session.host_id, ctx.user.id, ctx.session_id)
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
    let browser_session_id = relay_browser_session.id.to_string();
    let auth_code_repo = RelayAuthCodeRepository::new(&state.pool);
    let code = match auth_code_repo
        .create(session.host_id, &browser_session_id)
        .await
    {
        Ok(code) => code,
        Err(error) => {
            tracing::warn!(?error, "failed to create relay auth code");
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to generate auth code",
            )
                .into_response());
        }
    };

    Ok(Json(RelaySessionAuthCodeResponse {
        session_id: session.id,
        code,
    }))
}
