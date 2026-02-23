//! Relay subdomain handlers: auth code exchange and proxy.

use axum::{
    body::Body,
    extract::{Query, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use axum_extra::headers::{Cookie, HeaderMapExt};
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

const RELAY_EXCHANGE_PATH: &str = "/__relay/exchange";

#[derive(Debug, Deserialize)]
struct RelayExchangeQuery {
    code: String,
}

/// Entry point for relay-subdomain traffic. Dispatches exchange vs proxy.
pub async fn relay_subdomain_request(
    state: State<RelayAppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    if request.uri().path() == RELAY_EXCHANGE_PATH {
        return relay_subdomain_exchange(state, request, host_id).await;
    }

    relay_subdomain_proxy(state, request, host_id).await
}

/// Handle `GET /__relay/exchange?code=...` on a relay subdomain.
async fn relay_subdomain_exchange(
    State(state): State<RelayAppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    let code = match Query::<RelayExchangeQuery>::try_from_uri(request.uri()) {
        Ok(Query(params)) => params.code,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Missing code query parameter").into_response();
        }
    };

    let auth_code_repo = RelayAuthCodeRepository::new(&state.pool);
    match auth_code_repo.redeem_for_host(&code, host_id).await {
        Ok(Some(relay_cookie_value)) => Response::builder()
            .status(StatusCode::FOUND)
            .header("location", "/")
            .header(
                "set-cookie",
                format!("relay_token={relay_cookie_value}; Path=/; HttpOnly; Secure; SameSite=Lax"),
            )
            .body(Body::empty())
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response()),
        Ok(None) => (StatusCode::UNAUTHORIZED, "Invalid or expired code").into_response(),
        Err(error) => {
            tracing::warn!(?error, "failed to redeem relay auth code");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// Handle non-exchange relay subdomain requests using relay cookie auth.
async fn relay_subdomain_proxy(
    State(state): State<RelayAppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    let relay_token = request
        .headers()
        .typed_get::<Cookie>()
        .and_then(|cookie| cookie.get("relay_token").map(|s| s.to_owned()));

    let relay_token = match relay_token {
        Some(t) => t,
        None => return (StatusCode::UNAUTHORIZED, "Missing relay_token cookie").into_response(),
    };

    if let Err(response) = validate_relay_token_for_host(&state, &relay_token, host_id).await {
        return response;
    }

    do_relay_proxy_for_host(&state, host_id, request).await
}

async fn validate_relay_token_for_host(
    state: &RelayAppState,
    relay_token: &str,
    expected_host_id: Uuid,
) -> Result<(), Response> {
    let relay_browser_session_id = match Uuid::parse_str(relay_token) {
        Ok(id) => id,
        Err(error) => {
            tracing::warn!(?error, "invalid relay browser session cookie");
            return Err(StatusCode::UNAUTHORIZED.into_response());
        }
    };

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
        tracing::warn!(
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
    request: Request,
) -> Response {
    let relay = match state.relay_registry.get(&host_id).await {
        Some(relay) => relay,
        None => return (StatusCode::NOT_FOUND, "No active relay").into_response(),
    };

    proxy_request_over_control(relay.control.as_ref(), request, "").await
}
