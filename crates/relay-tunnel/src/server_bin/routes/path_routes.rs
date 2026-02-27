//! Relay path handlers: auth code exchange and proxy.

use axum::{
    body::Body,
    extract::{Path, Query, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use uuid::Uuid;

use super::super::{
    auth::request_context_from_auth_session_id,
    db::{
        hosts::HostRepository, identity_errors::IdentityError,
        relay_auth_codes::RelayAuthCodeRepository,
        relay_browser_sessions::RelayBrowserSessionRepository,
    },
    state::RelayAppState,
};
use crate::server::proxy_request_over_control;

const RELAY_PROXY_PREFIX: &str = "/relay/h";

#[derive(Debug, Deserialize)]
pub(super) struct RelayExchangeQuery {
    code: String,
}

/// Handle `GET /relay/h/{host_id}/exchange?code=...`.
pub(super) async fn relay_path_exchange(
    State(state): State<RelayAppState>,
    Path(host_id): Path<Uuid>,
    Query(params): Query<RelayExchangeQuery>,
) -> Response {
    let auth_code_repo = RelayAuthCodeRepository::new(&state.pool);
    match auth_code_repo.redeem_for_host(&params.code, host_id).await {
        Ok(Some(browser_session_id)) => {
            let location = format!("{RELAY_PROXY_PREFIX}/{host_id}/s/{browser_session_id}");

            Response::builder()
                .status(StatusCode::FOUND)
                .header("location", location)
                .body(Body::empty())
                .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Ok(None) => (StatusCode::UNAUTHORIZED, "Invalid or expired code").into_response(),
        Err(error) => {
            tracing::warn!(?error, "failed to redeem relay auth code");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// Handle `ANY /relay/h/{host_id}/s/{browser_session_id}`.
pub(super) async fn relay_path_proxy(
    State(state): State<RelayAppState>,
    Path((host_id, browser_session_id)): Path<(Uuid, Uuid)>,
    request: Request,
) -> Response {
    if let Err(response) =
        validate_browser_session_for_host(&state, browser_session_id, host_id).await
    {
        return response;
    }

    do_relay_proxy_for_host(&state, host_id, browser_session_id, request).await
}

/// Handle `ANY /relay/h/{host_id}/s/{browser_session_id}/{*tail}`.
pub(super) async fn relay_path_proxy_with_tail(
    State(state): State<RelayAppState>,
    Path((host_id, browser_session_id, _tail)): Path<(Uuid, Uuid, String)>,
    request: Request,
) -> Response {
    if let Err(response) =
        validate_browser_session_for_host(&state, browser_session_id, host_id).await
    {
        return response;
    }

    do_relay_proxy_for_host(&state, host_id, browser_session_id, request).await
}

async fn validate_browser_session_for_host(
    state: &RelayAppState,
    relay_browser_session_id: Uuid,
    expected_host_id: Uuid,
) -> Result<(), Response> {
    let relay_browser_session_repo = RelayBrowserSessionRepository::new(&state.pool);
    let relay_browser_session = match relay_browser_session_repo
        .get(relay_browser_session_id)
        .await
    {
        Ok(Some(session)) => session,
        Ok(None) => return Err(StatusCode::UNAUTHORIZED.into_response()),
        Err(error) => {
            tracing::warn!(?error, "failed to load relay browser session");
            return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
        }
    };

    if relay_browser_session.revoked_at.is_some() {
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    if relay_browser_session.host_id != expected_host_id {
        return Err((StatusCode::FORBIDDEN, "Host access denied").into_response());
    }

    let ctx =
        match request_context_from_auth_session_id(state, relay_browser_session.auth_session_id)
            .await
        {
            Ok(ctx) => ctx,
            Err(response) => {
                if let Err(error) = relay_browser_session_repo
                    .revoke(relay_browser_session.id)
                    .await
                {
                    tracing::warn!(?error, "failed to revoke relay browser session");
                }
                return Err(response);
            }
        };

    if ctx.user.id != relay_browser_session.user_id {
        tracing::warn!(
            relay_browser_session_user_id = %relay_browser_session.user_id,
            auth_session_user_id = %ctx.user.id,
            relay_browser_session_id = %relay_browser_session.id,
            "relay browser session user mismatch"
        );
        return Err(StatusCode::UNAUTHORIZED.into_response());
    }

    let host_repo = HostRepository::new(&state.pool);
    if let Err(error) = host_repo
        .assert_host_access(expected_host_id, ctx.user.id)
        .await
    {
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

    if let Err(error) = relay_browser_session_repo
        .touch(relay_browser_session.id)
        .await
    {
        tracing::debug!(
            ?error,
            relay_browser_session_id = %relay_browser_session.id,
            "failed to update relay browser session last-used timestamp"
        );
    }

    Ok(())
}

async fn do_relay_proxy_for_host(
    state: &RelayAppState,
    host_id: Uuid,
    browser_session_id: Uuid,
    request: Request,
) -> Response {
    let relay = match state.relay_registry.get(&host_id).await {
        Some(relay) => relay,
        None => return (StatusCode::NOT_FOUND, "No active relay").into_response(),
    };

    let strip_prefix = format!("{RELAY_PROXY_PREFIX}/{host_id}/s/{browser_session_id}");
    proxy_request_over_control(relay.control.as_ref(), request, &strip_prefix).await
}
