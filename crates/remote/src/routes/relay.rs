//! Relay routes: WebSocket control channel, HTTP proxy, and SSH tunnel over yamux.
//!
//! - `GET /relay/connect/{host_id}` — Protected. Local host connects via WebSocket.
//! - `GET /relay/ssh/{host_id}` — Protected. SSH tunnel via WebSocket + CONNECT.
//! - `POST /relay/sessions/{session_id}/auth-code` — Protected. Issues one-time code.
//! - Subdomain routing: `{host_id}.{RELAY_BASE_DOMAIN}` — Serves the full local
//!   frontend+API through the relay.
//!   - `GET /__relay/exchange?code=...` exchanges one-time auth code for cookie.
//!   - All other paths proxy with opaque `relay_token` cookie auth.

use std::sync::Arc;

use axum::{
    Extension, Json, Router,
    body::Body,
    extract::{Path, Query, Request, State, ws::WebSocketUpgrade},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::headers::{Cookie, HeaderMapExt};
use chrono::Utc;
use relay_tunnel::server::{
    open_tcp_tunnel, proxy_request_over_control, read_server_message, run_control_channel,
    write_server_message,
};
use serde::Deserialize;
use uuid::Uuid;
use api_types::RelaySessionAuthCodeResponse;

use crate::{
    AppState,
    auth::{RequestContext, request_context_from_auth_session_id},
    db::{
        hosts::HostRepository,
        identity_errors::IdentityError,
        relay_auth_codes::RelayAuthCodeRepository,
        relay_browser_sessions::RelayBrowserSessionRepository,
    },
    relay::{ActiveRelay, RelayRegistry},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/relay/connect/{host_id}", get(relay_connect))
        .route("/relay/ssh/{host_id}", get(relay_ssh))
        .route(
            "/relay/sessions/{session_id}/auth-code",
            post(relay_session_auth_code),
        )
}

const RELAY_EXCHANGE_PATH: &str = "/__relay/exchange";

async fn validate_relay_token_for_host(
    state: &AppState,
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

    let relay_browser_session_repo = RelayBrowserSessionRepository::new(state.pool());
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

    let ctx = match request_context_from_auth_session_id(state, relay_browser_session.auth_session_id)
        .await
    {
        Ok(ctx) => ctx,
        Err(response) => {
            if let Err(error) = relay_browser_session_repo.revoke(relay_browser_session.id).await {
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

    if let Err(error) = relay_browser_session_repo.touch(relay_browser_session.id).await {
        tracing::warn!(
            ?error,
            relay_browser_session_id = %relay_browser_session.id,
            "failed to update relay browser session last-used timestamp"
        );
    }

    Ok(())
}

/// Entry point for relay-subdomain traffic. Dispatches exchange vs proxy.
pub async fn relay_subdomain_request(
    state: State<AppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    if request.uri().path() == RELAY_EXCHANGE_PATH {
        return relay_subdomain_exchange(state, request, host_id).await;
    }

    relay_subdomain_proxy(state, request, host_id).await
}

/// Handle `GET /__relay/exchange?code=...` on a relay subdomain.
pub async fn relay_subdomain_exchange(
    State(state): State<AppState>,
    request: Request,
    host_id: Uuid,
) -> Response {
    let code = match Query::<RelayExchangeQuery>::try_from_uri(request.uri()) {
        Ok(Query(params)) => params.code,
        Err(_) => {
            return (StatusCode::BAD_REQUEST, "Missing code query parameter").into_response();
        }
    };

    let auth_code_repo = RelayAuthCodeRepository::new(state.pool());
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
pub async fn relay_subdomain_proxy(
    State(state): State<AppState>,
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

    do_relay_proxy_for_host(state, host_id, request, "").await
}

#[derive(Debug, Deserialize)]
struct RelayExchangeQuery {
    code: String,
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
    let connected_relay = Arc::new(tokio::sync::Mutex::new(None::<Arc<ActiveRelay>>));
    let connected_relay_for_connect = connected_relay.clone();
    let run_result = run_control_channel(socket, move |control| {
        let registry_for_connect = registry_for_connect.clone();
        let connected_relay_for_connect = connected_relay_for_connect.clone();
        async move {
            let relay = Arc::new(ActiveRelay::new(control));
            registry_for_connect.insert(host_id, relay.clone()).await;
            *connected_relay_for_connect.lock().await = Some(relay);
            tracing::info!(%host_id, "Relay control channel connected");
        }
    })
    .await;

    if let Err(error) = run_result {
        tracing::warn!(?error, %host_id, "relay session error");
    }

    let should_mark_offline = if let Some(relay) = connected_relay.lock().await.clone() {
        registry.remove_if_same(&host_id, &relay).await
    } else {
        registry.get(&host_id).await.is_none()
    };

    let repo = HostRepository::new(state.pool());
    if should_mark_offline {
        if let Err(error) = repo.mark_host_offline(host_id).await {
            tracing::warn!(?error, "failed to mark host offline");
        }
    } else {
        tracing::info!(
            %host_id,
            "Relay control channel disconnected; keeping host online because a newer channel is active"
        );
    }
    tracing::info!(%host_id, "Relay control channel disconnected");
}

// ── SSH Tunnel ───────────────────────────────────────────────────────

/// SSH relay endpoint. Upgrades to WebSocket, opens a TCP tunnel over the
/// host's yamux control channel via HTTP CONNECT, then bridges the two.
async fn relay_ssh(
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
                tracing::warn!(?db_error, "failed to validate host access for SSH relay");
                StatusCode::INTERNAL_SERVER_ERROR.into_response()
            }
            _ => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        };
    }

    let relay = match state.relay_registry().get(&host_id).await {
        Some(relay) => relay,
        None => return (StatusCode::NOT_FOUND, "Host is not connected").into_response(),
    };

    let _tcp_guard = match crate::relay::try_acquire_tcp_stream(&relay) {
        Some(guard) => guard,
        None => {
            return (StatusCode::TOO_MANY_REQUESTS, "Too many SSH connections").into_response()
        }
    };

    ws.on_upgrade(move |socket| async move {
        // _tcp_guard is moved into this future so the counter is held for the
        // lifetime of the SSH session and decremented on drop.
        handle_ssh_relay(socket, relay, _tcp_guard).await;
    })
}

async fn handle_ssh_relay(
    socket: axum::extract::ws::WebSocket,
    relay: Arc<ActiveRelay>,
    _tcp_guard: crate::relay::TcpStreamGuard,
) {
    let tunnel = match open_tcp_tunnel(&relay.control).await {
        Ok(tunnel) => tunnel,
        Err(error) => {
            tracing::warn!(?error, "failed to open TCP tunnel for SSH relay");
            return;
        }
    };

    let ws_io = relay_tunnel::ws_io::WsMessageStreamIo::new(
        socket,
        read_server_message,
        write_server_message,
    );
    let mut ws_io = tokio::io::BufStream::new(ws_io);
    let mut tunnel = hyper_util::rt::TokioIo::new(tunnel);

    if let Err(error) = tokio::io::copy_bidirectional(&mut ws_io, &mut tunnel).await {
        tracing::debug!(?error, "SSH relay tunnel ended");
    }
}

// ── Session Auth Code ──────────────────────────────────────────────────

/// Generate a one-time auth code for a relay session cookie exchange.
async fn relay_session_auth_code(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Extension(ctx): Extension<RequestContext>,
) -> Result<Json<RelaySessionAuthCodeResponse>, Response> {
    let relay_base_domain = match &state.config.relay_base_domain {
        Some(base) => base,
        None => {
            return Err((StatusCode::NOT_FOUND, "Relay subdomains not configured").into_response());
        }
    };

    let repo = HostRepository::new(state.pool());
    let session = match repo.get_session_for_requester(session_id, ctx.user.id).await {
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

    let registry = state.relay_registry();
    if registry.get(&session.host_id).await.is_none() {
        return Err((StatusCode::NOT_FOUND, "Host is not connected").into_response());
    }

    if let Err(error) = repo.mark_session_active(session.id).await {
        tracing::warn!(?error, "failed to mark relay session active");
        return Err(StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    let relay_browser_session_repo = RelayBrowserSessionRepository::new(state.pool());
    let relay_browser_session =
        match relay_browser_session_repo.create(session.host_id, ctx.user.id, ctx.session_id).await
        {
            Ok(session) => session,
            Err(error) => {
                tracing::warn!(?error, "failed to create relay browser session");
                return Err(
                    (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate auth code")
                        .into_response(),
                );
            }
        };
    let relay_cookie_value = relay_browser_session.id.to_string();
    let auth_code_repo = RelayAuthCodeRepository::new(state.pool());
    let code = match auth_code_repo
        .create(session.host_id, &relay_cookie_value)
        .await
    {
        Ok(code) => code,
        Err(error) => {
            tracing::warn!(?error, "failed to create relay auth code");
            return Err(
                (StatusCode::INTERNAL_SERVER_ERROR, "Failed to generate auth code")
                    .into_response(),
            );
        }
    };

    Ok(Json(RelaySessionAuthCodeResponse {
        session_id: session.id,
        relay_url: format!("https://{}.{relay_base_domain}/", session.host_id),
        code,
    }))
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
