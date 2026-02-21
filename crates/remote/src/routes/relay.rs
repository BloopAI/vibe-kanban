//! Relay routes: WebSocket control channel and HTTP proxy over yamux streams.
//!
//! - `GET /relay/connect/{host_id}` — Protected. Local host connects via WebSocket.
//! - `POST /relay/sessions/{session_id}/auth-code` — Protected. Issues one-time code.
//! - Subdomain routing: `{host_id}.{RELAY_BASE_DOMAIN}` — Serves the full local
//!   frontend+API through the relay. Auth via `relay_token` cookie.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{Path, Request, State, ws::WebSocketUpgrade},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::headers::{Cookie, HeaderMapExt};
use chrono::Utc;
use relay_tunnel::server::{proxy_request_over_control, run_control_channel};
use serde::Serialize;
use url::form_urlencoded;
use uuid::Uuid;

use crate::{
    AppState,
    auth::{RequestContext, request_context_from_access_token},
    db::{
        hosts::HostRepository,
        identity_errors::IdentityError,
    },
    relay::{ActiveRelay, RelayRegistry},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/relay/connect/{host_id}", get(relay_connect))
        .route(
            "/relay/sessions/{session_id}/auth-code",
            post(relay_session_auth_code),
        )
}

async fn validate_relay_token_for_host(
    state: &AppState,
    relay_token: &str,
    expected_host_id: Uuid,
) -> Result<(), Response> {
    let ctx = request_context_from_access_token(state, relay_token).await?;

    let host_repo = HostRepository::new(state.pool());
    if let Err(error) = host_repo.assert_host_access(expected_host_id, ctx.user.id).await {
        return Err(match error {
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                (StatusCode::FORBIDDEN, "Host access denied").into_response()
            }
            IdentityError::Database(db_error) => {
                tracing::warn!(?db_error, "failed to validate host access");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
            _ => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        });
    }

    Ok(())
}

#[derive(Debug, Serialize)]
struct RelaySessionAuthCodeResponse {
    session_id: Uuid,
    relay_url: String,
    code: String,
}

/// Extract the relay subdomain from a `Host` value using URL parsing.
pub fn extract_relay_subdomain(host: &str, relay_base_domain: &str) -> Option<String> {
    relay_tunnel::server::extract_relay_subdomain(host, relay_base_domain)
}

pub fn extract_relay_host_id(host: &str, relay_base_domain: &str) -> Option<Uuid> {
    let subdomain = extract_relay_subdomain(host, relay_base_domain)?;
    Uuid::parse_str(&subdomain).ok()
}

/// Handle requests arriving on a relay subdomain.
///
/// Two modes:
/// 1. `?code=<one-time-code>` — exchange the code for a `relay_token` cookie, redirect to `/`.
/// 2. Normal request with `relay_token` cookie — proxy to local server.
pub async fn relay_subdomain_proxy(
    State(state): State<AppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    if let Some(query) = request.uri().query()
        && let Some(code) = form_urlencoded::parse(query.as_bytes())
            .find_map(|(k, v)| (k == "code").then(|| v.into_owned()))
    {
        let registry = state.relay_registry();
        match registry.redeem_auth_code(&code).await {
            Some((code_host_id, relay_token)) if code_host_id == host_id => {
                return Response::builder()
                    .status(StatusCode::FOUND)
                    .header("location", "/")
                    .header(
                        "set-cookie",
                        format!(
                            "relay_token={relay_token}; Path=/; HttpOnly; Secure; SameSite=Lax"
                        ),
                    )
                    .body(Body::empty())
                    .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
            }
            _ => {
                return (StatusCode::UNAUTHORIZED, "Invalid or expired code").into_response();
            }
        }
    }

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

    do_relay_proxy_for_host(state, host_id, request, "").await
}

// ── Control Channel ────────────────────────────────────────────────────

/// Local server connects here to establish a relay control channel.
async fn relay_connect(
    State(state): State<AppState>,
    Path(host_id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
    ws: WebSocketUpgrade,
) -> Response {
    let repo = HostRepository::new(state.pool());
    if let Err(error) = repo.assert_host_access(host_id, ctx.user.id).await {
        return match error {
            IdentityError::PermissionDenied | IdentityError::NotFound => {
                (StatusCode::FORBIDDEN, "Host access denied").into_response()
            }
            IdentityError::Database(db_error) => {
                tracing::warn!(?db_error, "failed to validate host access for relay connect");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
            _ => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }

    if let Err(error) = repo.mark_host_online(host_id, None).await {
        tracing::warn!(?error, "failed to mark host online");
    }

    let registry = state.relay_registry().clone();
    let state_for_upgrade = state.clone();

    ws.on_upgrade(move |socket| async move {
        handle_control_channel(socket, state_for_upgrade, registry, host_id).await;
    })
}

async fn handle_control_channel(
    socket: axum::extract::ws::WebSocket,
    state: AppState,
    registry: RelayRegistry,
    host_id: Uuid,
) {
    let registry_for_connect = registry.clone();
    let run_result = run_control_channel(socket, move |control| {
        let registry_for_connect = registry_for_connect.clone();
        async move {
            let relay = Arc::new(ActiveRelay::new(control));
            registry_for_connect.insert(host_id, relay).await;
            tracing::info!(%host_id, "Relay control channel connected");
        }
    })
    .await;

    if let Err(error) = run_result {
        tracing::warn!(?error, %host_id, "relay session error");
    }

    registry.remove(&host_id).await;
    let repo = HostRepository::new(state.pool());
    if let Err(error) = repo.mark_host_offline(host_id).await {
        tracing::warn!(?error, "failed to mark host offline");
    }
    tracing::info!(%host_id, "Relay control channel disconnected");
}

// ── Session Auth Code ──────────────────────────────────────────────────

/// Generate a one-time auth code for a relay session cookie exchange.
async fn relay_session_auth_code(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
) -> Response {
    let relay_base_domain = match &state.config.relay_base_domain {
        Some(base) => base,
        None => return (StatusCode::NOT_FOUND, "Relay subdomains not configured").into_response(),
    };

    let repo = HostRepository::new(state.pool());
    let session = match repo.get_session_for_requester(session_id, ctx.user.id).await {
        Ok(Some(session)) => session,
        Ok(None) => return (StatusCode::NOT_FOUND, "Relay session not found").into_response(),
        Err(error) => {
            tracing::warn!(?error, "failed to load relay session");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    if session.ended_at.is_some() || session.state == "expired" {
        return (StatusCode::GONE, "Relay session expired").into_response();
    }

    if session.expires_at <= Utc::now() {
        if let Err(error) = repo.mark_session_expired(session.id).await {
            tracing::warn!(?error, "failed to mark relay session expired");
        }
        return (StatusCode::GONE, "Relay session expired").into_response();
    }

    let registry = state.relay_registry();
    if registry.get(&session.host_id).await.is_none() {
        return (StatusCode::NOT_FOUND, "Host is not connected").into_response();
    }

    if let Err(error) = repo.mark_session_active(session.id).await {
        tracing::warn!(?error, "failed to mark relay session active");
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }

    let relay_token = match state.jwt().generate_access_token(ctx.user.id, ctx.session_id) {
        Ok(token) => token,
        Err(error) => {
            tracing::error!(?error, "failed to generate relay access token");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate auth code")
                .into_response();
        }
    };
    let code = registry.store_auth_code(session.host_id, relay_token).await;

    Json(RelaySessionAuthCodeResponse {
        session_id: session.id,
        relay_url: format!("https://{}.{relay_base_domain}/", session.host_id),
        code,
    })
    .into_response()
}

// ── Proxy ──────────────────────────────────────────────────────────────

async fn do_relay_proxy_for_host(
    state: AppState,
    host_id: Uuid,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let relay = match state.relay_registry().get(&host_id).await {
        Some(relay) => relay,
        None => return (StatusCode::NOT_FOUND, "No active relay").into_response(),
    };

    proxy_request_over_control(relay.control.as_ref(), request, strip_prefix).await
}
