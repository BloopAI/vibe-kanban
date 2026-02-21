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
    extract::{Path, Request, State, ws::Message as AxumWsMessage, ws::WebSocketUpgrade},
    http::{StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use axum_extra::headers::{Cookie, HeaderMapExt};
use chrono::Utc;
use futures_util::StreamExt;
use hyper::{
    client::conn::http1 as client_http1,
    upgrade,
};
use hyper_util::rt::TokioIo;
use serde::Serialize;
use tokio_yamux::{Config as YamuxConfig, Session};
use url::{Url, form_urlencoded};
use utils::ws_io::{WsIoReadMessage, WsMessageStreamIo};
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

fn normalized_relay_path(uri: &axum::http::Uri, strip_prefix: &str) -> String {
    let raw_path = uri.path();
    let path = raw_path.strip_prefix(strip_prefix).unwrap_or(raw_path);
    let path = if path.is_empty() { "/" } else { path };
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    format!("{path}{query}")
}

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
    let host_domain = Url::parse(&format!("http://{host}"))
        .ok()?
        .host_str()?
        .to_ascii_lowercase();
    let base_domain = Url::parse(&format!("http://{relay_base_domain}"))
        .ok()?
        .host_str()?
        .to_ascii_lowercase();

    let suffix = format!(".{base_domain}");
    let prefix = host_domain.strip_suffix(&suffix)?;
    if prefix.is_empty() {
        None
    } else {
        Some(prefix.to_string())
    }
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
    let ws_io = WsMessageStreamIo::new(socket, read_server_message, write_server_message);
    let mut session = Session::new_server(ws_io, YamuxConfig::default());

    let relay = Arc::new(ActiveRelay::new(session.control()));
    registry.insert(host_id, relay).await;

    tracing::info!(%host_id, "Relay control channel connected");

    while let Some(stream_result) = session.next().await {
        match stream_result {
            Ok(_stream) => {
                // The remote side does not currently accept streams initiated by the local side.
            }
            Err(error) => {
                tracing::warn!(?error, %host_id, "relay session error");
                break;
            }
        }
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

    proxy_over_yamux(relay, request, strip_prefix).await
}

async fn proxy_over_yamux(
    relay: Arc<ActiveRelay>,
    request: Request,
    strip_prefix: &str,
) -> Response {
    let stream = {
        let mut control = relay.control.lock().await;
        match control.open_stream().await {
            Ok(stream) => stream,
            Err(error) => {
                tracing::warn!(?error, "failed to open relay stream");
                return (StatusCode::BAD_GATEWAY, "Relay connection lost").into_response();
            }
        }
    };

    let (mut parts, body) = request.into_parts();
    let path = normalized_relay_path(&parts.uri, strip_prefix);
    parts.uri = match Uri::builder().path_and_query(path).build() {
        Ok(uri) => uri,
        Err(error) => {
            tracing::warn!(?error, "failed to build relay proxy URI");
            return (StatusCode::BAD_REQUEST, "Invalid request URI").into_response();
        }
    };

    let mut outbound = Request::from_parts(parts, body);
    let request_upgrade = upgrade::on(&mut outbound);

    let (mut sender, connection) = match client_http1::Builder::new()
        .handshake(TokioIo::new(stream))
        .await
    {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?error, "failed to initialize relay stream proxy connection");
            return (StatusCode::BAD_GATEWAY, "Relay connection failed").into_response();
        }
    };

    tokio::spawn(async move {
        if let Err(error) = connection.with_upgrades().await {
            tracing::debug!(?error, "relay stream connection closed");
        }
    });

    let mut response = match sender.send_request(outbound).await {
        Ok(response) => response,
        Err(error) => {
            tracing::warn!(?error, "relay proxy request failed");
            return (StatusCode::BAD_GATEWAY, "Relay request failed").into_response();
        }
    };

    if response.status() == StatusCode::SWITCHING_PROTOCOLS {
        let response_upgrade = upgrade::on(&mut response);
        tokio::spawn(async move {
            let Ok(from_phone) = request_upgrade.await else {
                return;
            };
            let Ok(to_local) = response_upgrade.await else {
                return;
            };
            let mut from_phone = TokioIo::new(from_phone);
            let mut to_local = TokioIo::new(to_local);
            let _ = tokio::io::copy_bidirectional(&mut from_phone, &mut to_local).await;
        });
    }

    let (parts, body) = response.into_parts();
    Response::from_parts(parts, Body::new(body))
}

fn read_server_message(message: AxumWsMessage) -> WsIoReadMessage {
    match message {
        AxumWsMessage::Binary(data) => WsIoReadMessage::Data(data.to_vec()),
        AxumWsMessage::Text(text) => WsIoReadMessage::Data(text.as_bytes().to_vec()),
        AxumWsMessage::Close(_) => WsIoReadMessage::Eof,
        _ => WsIoReadMessage::Skip,
    }
}

fn write_server_message(bytes: Vec<u8>) -> AxumWsMessage {
    AxumWsMessage::Binary(bytes.into())
}
