//! HTTP / WebSocket endpoints powering the **Cursor MCP "lobby" model** (v4).
//!
//! Configuration lifecycle (PChat-equivalent):
//!
//! 1. The user copies ONE global `vibe-kanban-mcp --mode cursor-bridge`
//!    entry into `~/.cursor/mcp.json` (no `--workspace-id`).
//! 2. The bridge opens a single WebSocket to `GET /api/cursor-mcp/bridge/ws`
//!    over which it sends `Wait` / `Ping` frames.
//! 3. First time we see a `bridge_session_id`, we create a row in the
//!    `cursor_mcp_lobby_sessions` table and broadcast
//!    [`InboxPatch::SessionUpdated`] to UIs subscribed to the global
//!    inbox stream.
//! 4. The user opens the vibe-kanban Create Workspace page, picks a
//!    lobby conversation, fills in repos, and submits. The frontend
//!    creates the workspace + a vk session, then `POST`s to
//!    `/api/cursor-mcp/lobby/{bridge_session_id}/adopt` with the new
//!    `vk_session_id`. From that point on, every wait routes directly
//!    to the adopted vk session — the lobby entry is hidden from the
//!    picker.

use std::time::Duration;

use axum::{
    Json, Router,
    extract::{
        Path, Query, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::{IntoResponse, Json as ResponseJson},
    routing::{delete, get, post},
};
use db::models::{execution_process::ExecutionProcess, session::Session};
use deployment::Deployment;
use executors::logs::{
    NormalizedEntry, NormalizedEntryType,
    utils::{EntryIndexProvider, patch as logs_patch},
};
use serde::{Deserialize, Serialize};
use services::services::{
    container::ContainerService,
    cursor_mcp::{
        BRIDGE_PING_INTERVAL, BridgeHandle, BridgeInbound, BridgeOutbound, CursorMcpError,
        CursorMcpMessage, CursorMcpPatch, CursorMcpRole, CursorMcpService,
        CursorMcpSessionSnapshot, FORCE_RENEW_INTERVAL, InboxPatch, InboxSnapshot, TIMEOUT_RENEW,
    },
};
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{
    DeploymentImpl,
    middleware::signed_ws::{MaybeSignedWebSocket, SignedWsUpgrade},
};

// ===========================================================================
// Bridge WebSocket
// ===========================================================================

async fn bridge_ws(
    ws: WebSocketUpgrade,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        match handle_bridge_ws(socket, deployment).await {
            Ok(()) => tracing::debug!("cursor-mcp bridge WS closed cleanly"),
            Err(e) => tracing::warn!("cursor-mcp bridge WS closed with error: {}", e),
        }
    })
}

async fn handle_bridge_ws(mut socket: WebSocket, deployment: DeploymentImpl) -> anyhow::Result<()> {
    let svc = deployment.cursor_mcp().clone();
    let (handle, mut outbound_rx) = svc.register_bridge().await;

    let mut watchdog = tokio::time::interval(BRIDGE_PING_INTERVAL);
    watchdog.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    watchdog.tick().await; // skip first immediate tick

    let result: anyhow::Result<()> = loop {
        tokio::select! {
            outbound = outbound_rx.recv() => {
                match outbound {
                    Some(frame) => {
                        let text = match serde_json::to_string(&frame) {
                            Ok(t) => t,
                            Err(e) => {
                                tracing::warn!("cursor-mcp bridge outbound serialize: {}", e);
                                continue;
                            }
                        };
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break Ok(());
                        }
                    }
                    None => break Ok(()),
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        svc.note_bridge_inbound(&handle).await;
                        match serde_json::from_str::<BridgeInbound>(text.as_ref()) {
                            Ok(frame) => {
                                dispatch_bridge_inbound(
                                    frame,
                                    handle.clone(),
                                    svc.clone(),
                                    deployment.clone(),
                                );
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "cursor-mcp bridge bad inbound JSON: {} ({})",
                                    text,
                                    e
                                );
                                let _ = handle.send_tx.send(BridgeOutbound::Error {
                                    request_id: None,
                                    message: format!("invalid frame: {}", e),
                                });
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) => break Ok(()),
                    Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Binary(_))) => {
                        svc.note_bridge_inbound(&handle).await;
                    }
                    Some(Err(e)) => {
                        break Err(anyhow::anyhow!("bridge WS recv error: {}", e));
                    }
                    None => break Ok(()),
                }
            }
            _ = watchdog.tick() => {
                if svc.bridge_is_stale(&handle).await {
                    tracing::warn!(
                        "cursor-mcp bridge {} silent for too long — closing",
                        handle.bridge_id
                    );
                    break Err(anyhow::anyhow!("bridge keepalive timeout"));
                }
            }
        }
    };

    svc.unregister_bridge(&handle).await;
    result
}

fn dispatch_bridge_inbound(
    frame: BridgeInbound,
    handle: std::sync::Arc<BridgeHandle>,
    svc: CursorMcpService,
    deployment: DeploymentImpl,
) {
    match frame {
        BridgeInbound::Register { version, label } => {
            tokio::spawn(async move {
                tracing::info!(
                    "cursor-mcp bridge {} registered (version={}, label={:?})",
                    handle.bridge_id,
                    version,
                    label
                );
                svc.set_bridge_label(&handle, label).await;
                let _ = handle.send_tx.send(BridgeOutbound::Registered);
            });
        }
        BridgeInbound::Ping => {
            let _ = handle.send_tx.send(BridgeOutbound::Pong);
        }
        BridgeInbound::CancelWait { request_id } => {
            tracing::debug!(
                "cursor-mcp bridge cancel_wait {} (no-op; rely on UI-side cancel)",
                request_id
            );
        }
        BridgeInbound::Wait {
            request_id,
            bridge_session_id,
            message,
            prompt,
            title,
        } => {
            tokio::spawn(async move {
                handle_bridge_wait(
                    handle,
                    svc,
                    deployment,
                    request_id,
                    bridge_session_id,
                    message,
                    prompt,
                    title,
                )
                .await;
            });
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn handle_bridge_wait(
    handle: std::sync::Arc<BridgeHandle>,
    svc: CursorMcpService,
    deployment: DeploymentImpl,
    request_id: String,
    bridge_session_id: String,
    message: String,
    prompt: Option<String>,
    title: Option<String>,
) {
    // Mint a friendly id when the LLM asks for "NEW"; reuse otherwise.
    let resolved_id = match bridge_session_id.trim() {
        "" | "NEW" | "new" => svc.generate_friendly_bridge_session_id(),
        other => other.to_string(),
    };

    let bridge_label = handle.label.read().await.clone();

    // If this conversation has already been adopted, push the assistant
    // message into the matching ExecutionProcess MsgStore so the standard
    // chat banner renders it like every other agent.
    //
    // Routing falls back to the DB's `adopted_into_session_id` when the
    // in-memory `bridge_to_vk` map hasn't observed the adoption yet
    // (mirrors `enqueue_wait`'s fallback). The MsgStore push itself is
    // retried briefly because the adoption flow spawns the placeholder
    // ExecutionProcess and registers its MsgStore atomically, but a
    // racing wait can land in the microsecond gap.
    let vk_session_id = match svc.resolve_bridge_session(&resolved_id) {
        Some(id) => Some(id),
        None => {
            match db::models::cursor_mcp_lobby::CursorMcpLobbySession::find(
                &deployment.db().pool,
                &resolved_id,
            )
            .await
            {
                Ok(Some(row)) => row.adopted_into_session_id,
                _ => None,
            }
        }
    };
    if let Some(vk_session_id) = vk_session_id
        && let Err(err) = push_chat_message_with_retry(
            &deployment,
            vk_session_id,
            AssistantOrUser::Assistant,
            &message,
        )
        .await
    {
        tracing::warn!(
            "cursor-mcp bridge wait: failed to push assistant entry to MsgStore for {} after retries: {}. Chat panel will be out of sync with Cursor until the next reload.",
            vk_session_id,
            err
        );
    }

    let rx = svc
        .enqueue_wait(
            resolved_id.clone(),
            bridge_label,
            request_id.clone(),
            message,
            prompt,
            title,
        )
        .await;
    // Associate this pending wait with the owning bridge so when the
    // bridge WS drops we can drain its pending waits and stop showing
    // stale "N waiting" rows in the lobby picker.
    svc.tag_pending_bridge(&request_id, handle.bridge_id);

    let max_wait = FORCE_RENEW_INTERVAL + Duration::from_secs(60);
    let text = match tokio::time::timeout(max_wait, rx).await {
        Ok(Ok(t)) => t,
        Ok(Err(_)) => {
            tracing::warn!("cursor-mcp bridge wait sender dropped");
            TIMEOUT_RENEW.to_string()
        }
        Err(_) => {
            tracing::warn!("cursor-mcp bridge wait exceeded hard timeout");
            TIMEOUT_RENEW.to_string()
        }
    };

    let _ = handle.send_tx.send(BridgeOutbound::WaitResult {
        request_id,
        text,
        session_id: resolved_id,
    });
}

// ===========================================================================
// MsgStore push helpers (used by bridge wait + follow-up)
// ===========================================================================

#[derive(Debug, Clone, Copy)]
enum AssistantOrUser {
    Assistant,
    User,
}

/// Push a chat message into the session's MsgStore, retrying a few
/// times if no execution_process / MsgStore is registered yet.
///
/// Both directions of the Cursor MCP conversation use this:
/// - **Assistant**: from `handle_bridge_wait` when Cursor calls
///   `wait_for_user_input`. There's a race where adoption finishes on
///   axum's task, but the bridge WS task is ahead by a few hundred
///   microseconds and arrives before the placeholder's MsgStore is
///   registered.
/// - **User**: from `/cursor-mcp/sessions/{id}/resolve` when the
///   vibe-kanban user types a reply. Without retry the user's own
///   message can silently drop — the wait still resolves (Cursor keeps
///   going), but the chat panel is left showing only alternating
///   assistant bubbles with no user turns between them.
async fn push_chat_message_with_retry(
    deployment: &DeploymentImpl,
    session_id: Uuid,
    role: AssistantOrUser,
    body: &str,
) -> anyhow::Result<()> {
    const ATTEMPTS: u32 = 5;
    const BACKOFF: Duration = Duration::from_millis(200);

    let mut last_err: Option<anyhow::Error> = None;
    for attempt in 0..ATTEMPTS {
        match push_message_to_session_msgstore(deployment, session_id, role, body).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                if attempt + 1 < ATTEMPTS {
                    tokio::time::sleep(BACKOFF).await;
                }
                last_err = Some(err);
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("unknown push error")))
}

async fn push_message_to_session_msgstore(
    deployment: &DeploymentImpl,
    session_id: Uuid,
    role: AssistantOrUser,
    body: &str,
) -> anyhow::Result<()> {
    let pool = &deployment.db().pool;
    let processes = ExecutionProcess::find_by_session_id(pool, session_id, false).await?;
    let Some(latest) = processes.into_iter().last() else {
        anyhow::bail!("no execution process for session");
    };
    let Some(msg_store) = deployment.container().get_msg_store_by_id(&latest.id).await else {
        anyhow::bail!("msg store missing for execution process");
    };
    let entry = NormalizedEntry {
        timestamp: Some(chrono::Utc::now().to_rfc3339()),
        entry_type: match role {
            AssistantOrUser::Assistant => NormalizedEntryType::AssistantMessage,
            AssistantOrUser::User => NormalizedEntryType::UserMessage,
        },
        content: body.to_string(),
        metadata: None,
    };
    let provider = EntryIndexProvider::start_from(&msg_store);
    logs_patch::add_normalized_entry(&msg_store, &provider, entry);
    Ok(())
}

pub async fn push_user_reply_to_session_msgstore(
    deployment: &DeploymentImpl,
    session_id: Uuid,
    body: &str,
) {
    if let Err(err) =
        push_chat_message_with_retry(deployment, session_id, AssistantOrUser::User, body).await
    {
        // Elevated from debug → warn because a dropped user entry
        // leaves the chat panel looking like Cursor is replying to
        // itself (assistant bubbles stacking with no user turns
        // between them). Surface it so ops can correlate with any
        // MsgStore lifecycle bugs.
        tracing::warn!(
            "cursor-mcp: failed to mirror user reply into session {} MsgStore after retries: {}. Chat panel will show an assistant-only conversation until the next reload.",
            session_id,
            err
        );
    }
}

pub async fn replay_adopted_cursor_mcp_messages_to_session_msgstore(
    deployment: &DeploymentImpl,
    session_id: Uuid,
    messages: &[CursorMcpMessage],
) -> anyhow::Result<()> {
    for message in messages {
        if message.role != CursorMcpRole::Assistant {
            continue;
        }
        push_message_to_session_msgstore(
            deployment,
            session_id,
            AssistantOrUser::Assistant,
            &message.body,
        )
        .await?;
    }
    Ok(())
}

pub async fn adopt_cursor_mcp_lobby_session(
    deployment: &DeploymentImpl,
    bridge_session_id: &str,
    vk_session_id: Uuid,
) -> Result<(), anyhow::Error> {
    let adopted = deployment
        .cursor_mcp()
        .adopt_lobby_session(bridge_session_id, vk_session_id)
        .await
        .map_err(anyhow::Error::from)?;

    replay_adopted_cursor_mcp_messages_to_session_msgstore(
        deployment,
        vk_session_id,
        &adopted.migrated_messages,
    )
    .await?;

    Ok(())
}

// ===========================================================================
// Per-vk-session REST + WebSocket (chat banner)
// ===========================================================================

async fn get_session_state(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
) -> ResponseJson<ApiResponse<CursorMcpSessionSnapshot>> {
    let snap = deployment.cursor_mcp().session_snapshot(session_id).await;
    ResponseJson(ApiResponse::success(snap))
}

#[derive(Debug, Deserialize)]
pub struct CancelWaitBody {
    pub request_id: String,
}

async fn cancel_wait(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<CancelWaitBody>,
) -> Result<ResponseJson<ApiResponse<bool>>, StatusCode> {
    let ok = deployment
        .cursor_mcp()
        .cancel_wait(session_id, &body.request_id)
        .await;
    Ok(ResponseJson(ApiResponse::success(ok)))
}

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct ResolveBody {
    pub text: String,
}

async fn resolve_with_user_reply(
    State(deployment): State<DeploymentImpl>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<ResolveBody>,
) -> ResponseJson<ApiResponse<bool>> {
    // Order matters: resolve first, mirror into the chat panel only
    // when a wait was actually popped off the rendezvous queue.
    //
    // - On success, the user reply is in-flight to Cursor, so we also
    //   push it into the session MsgStore (the standard chat panel
    //   reads its entries from there, not from the cursor-mcp WS).
    //   The legacy path through `sessions::follow_up` calls the same
    //   helper; this keeps parity now that the frontend short-circuits
    //   straight to `/cursor-mcp/sessions/.../resolve`.
    // - On `ok == false` (no pending wait), Cursor never sees the
    //   message, so rendering it in the chat panel would desync the
    //   vk conversation from the actual Cursor conversation. Swallow
    //   it and let the frontend surface the "nothing to resolve" state.
    let ok = deployment
        .cursor_mcp()
        .resolve_with_user_reply(session_id, body.text.clone())
        .await;
    if ok {
        push_user_reply_to_session_msgstore(&deployment, session_id, &body.text).await;
    }
    ResponseJson(ApiResponse::success(ok))
}

#[derive(Debug, Deserialize)]
pub struct SessionStreamQuery {
    pub session_id: Uuid,
}

async fn stream_session_ws(
    ws: SignedWsUpgrade,
    Query(query): Query<SessionStreamQuery>,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_session_ws(socket, deployment, query.session_id).await {
            tracing::warn!("cursor-mcp session WS closed: {}", e);
        }
    })
}

async fn handle_session_ws(
    mut socket: MaybeSignedWebSocket,
    deployment: DeploymentImpl,
    session_id: Uuid,
) -> anyhow::Result<()> {
    let svc = deployment.cursor_mcp();
    let (snapshot, mut rx) = svc.subscribe_session(session_id).await;

    let initial = CursorMcpPatch::Snapshot(snapshot);
    let initial_text = serde_json::to_string(&initial)?;
    socket.send(Message::Text(initial_text.into())).await?;

    loop {
        tokio::select! {
            patch = rx.recv() => {
                match patch {
                    Ok(p) => {
                        let text = serde_json::to_string(&p)?;
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        let snap = svc.session_snapshot(session_id).await;
                        let text = serde_json::to_string(&CursorMcpPatch::Snapshot(snap))?;
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }

    Ok(())
}

// ===========================================================================
// Inbox (global) — REST + WebSocket
// ===========================================================================

async fn get_inbox_state(
    State(deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<InboxSnapshot>> {
    let snap = deployment.cursor_mcp().inbox_snapshot().await;
    ResponseJson(ApiResponse::success(snap))
}

async fn stream_inbox_ws(
    ws: SignedWsUpgrade,
    State(deployment): State<DeploymentImpl>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| async move {
        if let Err(e) = handle_inbox_ws(socket, deployment).await {
            tracing::warn!("cursor-mcp inbox WS closed: {}", e);
        }
    })
}

async fn handle_inbox_ws(
    mut socket: MaybeSignedWebSocket,
    deployment: DeploymentImpl,
) -> anyhow::Result<()> {
    let svc = deployment.cursor_mcp();
    let (snapshot, mut rx) = svc.subscribe_inbox().await;

    let initial = InboxPatch::Snapshot(snapshot);
    let initial_text = serde_json::to_string(&initial)?;
    socket.send(Message::Text(initial_text.into())).await?;

    loop {
        tokio::select! {
            patch = rx.recv() => {
                match patch {
                    Ok(p) => {
                        let text = serde_json::to_string(&p)?;
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        let snap = svc.inbox_snapshot().await;
                        let text = serde_json::to_string(&InboxPatch::Snapshot(snap))?;
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            break;
                        }
                    }
                }
            }
            inbound = socket.recv() => {
                match inbound {
                    Ok(Some(Message::Close(_))) => break,
                    Ok(Some(_)) => {}
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
    }
    Ok(())
}

// ===========================================================================
// Lobby management — REST endpoints
// ===========================================================================

#[derive(Debug, Deserialize, Serialize, TS)]
#[ts(export)]
pub struct AdoptLobbyBody {
    /// vk session id that should "claim" this Cursor MCP conversation.
    /// Must already exist (caller creates the session first).
    pub vk_session_id: Uuid,
}

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct AdoptLobbyResponse {
    pub bridge_session_id: String,
    pub vk_session_id: Uuid,
}

async fn adopt_lobby_session(
    State(deployment): State<DeploymentImpl>,
    Path(bridge_session_id): Path<String>,
    Json(body): Json<AdoptLobbyBody>,
) -> Result<ResponseJson<ApiResponse<AdoptLobbyResponse>>, StatusCode> {
    // Verify the target vk session actually exists before we create a
    // ghost mapping — otherwise a typo'd / spoofed request would leave a
    // row pointing at a non-existent session that we'd happily resolve
    // to forever.
    match Session::find_by_id(&deployment.db().pool, body.vk_session_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("adopt_lobby_session: session lookup failed: {}", e);
            return Err(StatusCode::INTERNAL_SERVER_ERROR);
        }
    }

    match adopt_cursor_mcp_lobby_session(&deployment, &bridge_session_id, body.vk_session_id).await
    {
        Ok(()) => Ok(ResponseJson(ApiResponse::success(AdoptLobbyResponse {
            bridge_session_id,
            vk_session_id: body.vk_session_id,
        }))),
        Err(err)
            if err
                .downcast_ref::<CursorMcpError>()
                .is_some_and(|e| matches!(e, CursorMcpError::LobbyAlreadyAdopted(_))) =>
        {
            Err(StatusCode::CONFLICT)
        }
        Err(err)
            if err
                .downcast_ref::<CursorMcpError>()
                .is_some_and(|e| matches!(e, CursorMcpError::LobbyNotFound(_))) =>
        {
            Err(StatusCode::NOT_FOUND)
        }
        Err(e) => {
            tracing::error!("adopt_lobby_session: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

async fn delete_lobby_session(
    State(deployment): State<DeploymentImpl>,
    Path(bridge_session_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    match deployment
        .cursor_mcp()
        .delete_lobby_session(&bridge_session_id)
        .await
    {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(CursorMcpError::LobbyNotFound(_)) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            tracing::error!("delete_lobby_session: {}", e);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

// ===========================================================================
// Launch config (global, no workspace)
// ===========================================================================

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct LaunchConfig {
    pub mcp_json_snippet: String,
    pub server_name: String,
    pub binary_path: Option<String>,
    pub binary_exists: bool,
    pub binary_source: String,
}

async fn launch_config(
    State(_deployment): State<DeploymentImpl>,
) -> ResponseJson<ApiResponse<LaunchConfig>> {
    // v4: one global mcp.json entry, no --workspace-id.
    let server_name = "vibe-kanban-cursor-mcp".to_string();
    let resolution = utils::mcp_binary::resolve_mcp_binary();
    let binary_path_str = resolution.path.display().to_string();

    let snippet = serde_json::json!({
        server_name.clone(): {
            "command": binary_path_str.clone(),
            "args": ["--mode", "cursor-bridge"]
        }
    });

    ResponseJson(ApiResponse::success(LaunchConfig {
        mcp_json_snippet: serde_json::to_string_pretty(&snippet)
            .unwrap_or_else(|_| "{}".to_string()),
        server_name,
        binary_path: Some(binary_path_str),
        binary_exists: resolution.exists,
        binary_source: resolution.source.to_string(),
    }))
}

// ===========================================================================
// Router
// ===========================================================================

pub fn router() -> Router<DeploymentImpl> {
    Router::new()
        // Bridge endpoint — only thing the stdio MCP process talks to.
        .route("/cursor-mcp/bridge/ws", get(bridge_ws))
        // Per-vk-session endpoints (chat banner / chat input).
        .route(
            "/cursor-mcp/sessions/{session_id}/state",
            get(get_session_state),
        )
        .route(
            "/cursor-mcp/sessions/{session_id}/cancel",
            post(cancel_wait),
        )
        .route(
            "/cursor-mcp/sessions/{session_id}/resolve",
            post(resolve_with_user_reply),
        )
        .route("/cursor-mcp/sessions/stream/ws", get(stream_session_ws))
        // Global Inbox (workspace picker on the Create Workspace page).
        .route("/cursor-mcp/inbox/state", get(get_inbox_state))
        .route("/cursor-mcp/inbox/stream/ws", get(stream_inbox_ws))
        // Lobby admin.
        .route(
            "/cursor-mcp/lobby/{bridge_session_id}/adopt",
            post(adopt_lobby_session),
        )
        .route(
            "/cursor-mcp/lobby/{bridge_session_id}",
            delete(delete_lobby_session),
        )
        // Launch config (global).
        .route("/cursor-mcp/launch-config", get(launch_config))
}
