//! `vibe-kanban-mcp --mode cursor-bridge [--label <text>]` (v4 lobby model)
//!
//! v4 stdio MCP server that:
//! 1. Holds a single WebSocket open to
//!    `ws://<backend>/api/cursor-mcp/bridge/ws` for the lifetime of the
//!    process. **No workspace-id**: bridges are global; the backend
//!    routes by `bridge_session_id` instead.
//! 2. Sends a 30-second `Ping` heartbeat so the backend can detect the
//!    bridge going away in real time.
//! 3. Exposes a single MCP tool, `wait_for_user_input`, that the LLM
//!    calls at the end of every Composer turn. The tool body is
//!    forwarded over the WebSocket as a `Wait` frame and blocks on a
//!    `oneshot` until the backend pushes back a `WaitResult`.
//!
//! On `Register`, the bridge sends an optional `label` derived from
//! `<hostname> · <cwd>` (or overridden by the `--label` flag) so the
//! Inbox UI can disambiguate which Cursor window / machine produced a
//! given conversation.

use std::{sync::Arc, time::Duration};

use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use rmcp::{
    ErrorData, ServerHandler,
    handler::server::{tool::ToolRouter, wrapper::Parameters},
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, serde_json, tool, tool_handler, tool_router,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex as AsyncMutex, mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

pub const TIMEOUT_RENEW: &str = "TIMEOUT_RENEW";
#[allow(dead_code)]
pub const USER_DISMISSED_QUEUE: &str = "__USER_DISMISSED_QUEUE__";

const PING_INTERVAL: Duration = Duration::from_secs(30);
const TOOL_CALL_HARD_TIMEOUT: Duration = Duration::from_secs(60 * 70);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BridgeInbound {
    Register {
        version: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        label: Option<String>,
    },
    Wait {
        request_id: String,
        bridge_session_id: String,
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        title: Option<String>,
    },
    #[allow(dead_code)]
    CancelWait {
        request_id: String,
    },
    Ping,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BridgeOutbound {
    Registered,
    WaitResult {
        request_id: String,
        text: String,
        session_id: String,
    },
    Error {
        #[serde(default)]
        request_id: Option<String>,
        message: String,
    },
    Pong,
}

struct WaitEnvelope {
    text: String,
    session_id: String,
}

/// Pending tool call, indexed by the MCP `request_id` we minted when the
/// LLM invoked `wait_for_user_input`. We remember the *original*
/// `sessionId` the LLM passed in so that when the bridge WS drops mid-
/// wait we can echo that exact id back — otherwise the LLM sees a
/// `[session_id: NEW]` on retry and forks the conversation.
struct PendingEntry {
    tx: oneshot::Sender<WaitEnvelope>,
    original_session_id: String,
}

struct BridgeInner {
    outbound_tx: mpsc::UnboundedSender<BridgeInbound>,
    pending: Arc<DashMap<String, PendingEntry>>,
}

#[derive(Clone)]
pub struct CursorBridgeServer {
    inner: Arc<BridgeInner>,
    tool_router: ToolRouter<Self>,
}

impl std::fmt::Debug for CursorBridgeServer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CursorBridgeServer").finish()
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct WaitForUserInputArgs {
    #[schemars(
        description = "The complete assistant reply text to display to the user as the current message in the persistent chat panel. Use full Markdown."
    )]
    pub message: String,

    #[schemars(
        description = "REQUIRED. Identifies which Cursor MCP conversation this Composer chat belongs to. On the FIRST tool call of a new Composer chat, pass the literal string \"NEW\" so the backend mints a fresh friendly id (e.g. \"ab12-cd34\"). The backend echoes the resolved id in the tool result as `[session_id: ab12-cd34]`. EVERY subsequent call in this same Composer chat MUST pass that exact same id back so the conversation stays bound to one vibe-kanban session. You may also pass a custom human-friendly id (e.g. \"refactor-foo\") on the first call instead of \"NEW\"."
    )]
    pub session_id: String,

    #[schemars(
        description = "Hint text shown above the input box. Optional. Use to guide the user's reply."
    )]
    #[serde(default)]
    pub prompt: Option<String>,

    #[schemars(
        description = "Optional title hint for the lobby preview. Only takes effect on the FIRST call (when the conversation is being added to the inbox). Subsequent calls are ignored."
    )]
    #[serde(default)]
    pub title: Option<String>,
}

impl CursorBridgeServer {
    /// `label` is shown in the Inbox picker so the user can tell which
    /// Cursor window / machine produced a conversation. Pass `None` to
    /// auto-derive `<hostname> · <cwd>`.
    pub fn new(base_url: &str, label: Option<String>) -> Self {
        let pending: Arc<DashMap<String, PendingEntry>> = Arc::new(DashMap::new());
        let (outbound_tx, outbound_rx) = mpsc::unbounded_channel::<BridgeInbound>();

        let resolved_label = label.or_else(default_label);

        tokio::spawn(driver_loop(
            base_url.to_string(),
            resolved_label,
            pending.clone(),
            outbound_rx,
        ));

        let inner = Arc::new(BridgeInner {
            outbound_tx,
            pending,
        });

        Self {
            inner,
            tool_router: Self::tool_router_default(),
        }
    }
}

fn default_label() -> Option<String> {
    let host = hostname_or_unknown();
    let cwd = std::env::current_dir()
        .ok()
        .and_then(|p| p.file_name().map(|f| f.to_string_lossy().into_owned()))
        .unwrap_or_else(|| "?".to_string());
    Some(format!("{} · {}", host, cwd))
}

fn hostname_or_unknown() -> String {
    // Resolution order:
    // 1. Env var override (`HOSTNAME` / `COMPUTERNAME`). Some users set
    //    this explicitly in shells; respect it.
    // 2. `scutil --get LocalHostName` on macOS, which returns the
    //    friendly hostname even when `HOSTNAME` is not exported (the
    //    default Cursor-spawned process environment).
    // 3. `/etc/hostname` on Linux.
    // 4. Fallback placeholder.
    if let Ok(h) = std::env::var("HOSTNAME")
        && !h.trim().is_empty()
    {
        return h.trim().to_string();
    }
    if let Ok(h) = std::env::var("COMPUTERNAME")
        && !h.trim().is_empty()
    {
        return h.trim().to_string();
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = std::process::Command::new("scutil")
            .args(["--get", "LocalHostName"])
            .output()
            && out.status.success()
        {
            let h = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !h.is_empty() {
                return h;
            }
        }
    }
    if let Ok(h) = std::fs::read_to_string("/etc/hostname") {
        let trimmed = h.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "?".to_string()
}

#[tool_router(router = tool_router_default, vis = "pub")]
impl CursorBridgeServer {
    #[tool(
        description = "Wait for user input in the vibe-kanban Cursor MCP persistent chat panel.\n\nSESSION ROUTING (read carefully):\n- On the FIRST call within a new Composer chat, pass `sessionId: \"NEW\"`. The tool result will include `[session_id: <id>]` — the backend's chosen friendly id (e.g. `ab12-cd34`).\n- On EVERY subsequent call in the SAME Composer chat, pass that exact same `sessionId` so the conversation stays bound to one vibe-kanban session. NEVER pass `\"NEW\"` again or you will fork into a brand-new conversation.\n- You may instead pass a custom friendly id (e.g. `\"refactor-foo\"`, `\"bug-123\"`) as the first sessionId — the backend will adopt it.\n\nRETURN VALUE RULES:\n- Normal text returned: process as the user's reply.\n- Text starting with `\"TIMEOUT_RENEW\"`: keep-alive signal. Do NOT show this to the user. Silently re-call this tool with the SAME `sessionId`. This may repeat many times.\n- Text equal to `\"__USER_DISMISSED_QUEUE__\"`: the user cancelled this prompt from the UI. Treat it as the user choosing to stop the loop.\n\nThe tool blocks until one of the above happens (up to ~55 minutes per call before auto-renewing)."
    )]
    async fn wait_for_user_input(
        &self,
        Parameters(args): Parameters<WaitForUserInputArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel::<WaitEnvelope>();
        let original_session_id = args.session_id.trim().to_string();
        self.inner.pending.insert(
            request_id.clone(),
            PendingEntry {
                tx,
                original_session_id: original_session_id.clone(),
            },
        );

        let frame = BridgeInbound::Wait {
            request_id: request_id.clone(),
            bridge_session_id: original_session_id,
            message: args.message,
            prompt: args.prompt,
            title: args.title,
        };

        if self.inner.outbound_tx.send(frame).is_err() {
            self.inner.pending.remove(&request_id);
            return Ok(Self::error_result(
                "vibe-kanban bridge driver shut down — backend unreachable",
            ));
        }

        let envelope = match tokio::time::timeout(TOOL_CALL_HARD_TIMEOUT, rx).await {
            Ok(Ok(env)) => env,
            Ok(Err(_)) => {
                self.inner.pending.remove(&request_id);
                return Ok(Self::keep_alive_result(args.session_id.trim()));
            }
            Err(_) => {
                self.inner.pending.remove(&request_id);
                return Ok(Self::keep_alive_result(args.session_id.trim()));
            }
        };

        let body = format!("{}\n\n[session_id: {}]", envelope.text, envelope.session_id);
        Ok(CallToolResult::success(vec![Content::text(body)]))
    }
}

impl CursorBridgeServer {
    fn keep_alive_result(session_id: &str) -> CallToolResult {
        let echoed = if session_id.is_empty() || session_id.eq_ignore_ascii_case("NEW") {
            "NEW".to_string()
        } else {
            session_id.to_string()
        };
        CallToolResult::success(vec![Content::text(format!(
            "{}\n\n[session_id: {}]",
            TIMEOUT_RENEW, echoed
        ))])
    }

    fn error_result(msg: &str) -> CallToolResult {
        let value = serde_json::json!({
            "success": false,
            "error": msg,
        });
        let body = serde_json::to_string_pretty(&value).unwrap_or_else(|_| msg.to_string());
        let mut result = CallToolResult::success(vec![Content::text(body)]);
        result.is_error = Some(true);
        result
    }
}

#[tool_handler]
impl ServerHandler for CursorBridgeServer {
    fn get_info(&self) -> ServerInfo {
        let instructions = "vibe-kanban Cursor MCP bridge. \
             Call `wait_for_user_input` at the end of every assistant turn so the user can reply in vibe-kanban. \
             On the FIRST call of a new chat pass sessionId=\"NEW\" (or a custom id). On every subsequent call reuse the id from the previous result's [session_id: ...] tag. \
             If the tool returns text starting with `TIMEOUT_RENEW`, silently call it again with the same sessionId. \
             If it returns `__USER_DISMISSED_QUEUE__`, the user cancelled the prompt.";

        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new(
                "vibe-kanban-mcp-cursor-bridge",
                env!("CARGO_PKG_VERSION"),
            ))
            .with_protocol_version(ProtocolVersion::V_2025_03_26)
            .with_instructions(instructions)
    }
}

// ---------------------------------------------------------------------------
// Driver loop — owns the WebSocket, reconnects forever, drains outbound_rx.
// ---------------------------------------------------------------------------

async fn driver_loop(
    base_url: String,
    label: Option<String>,
    pending: Arc<DashMap<String, PendingEntry>>,
    outbound_rx: mpsc::UnboundedReceiver<BridgeInbound>,
) {
    let outbound_rx = Arc::new(AsyncMutex::new(outbound_rx));

    let ws_url = format!(
        "{}/api/cursor-mcp/bridge/ws",
        base_url
            .trim_end_matches('/')
            .replacen("http://", "ws://", 1)
            .replacen("https://", "wss://", 1),
    );

    let mut backoff = Duration::from_millis(500);
    const MAX_BACKOFF: Duration = Duration::from_secs(30);

    loop {
        match connect_and_run(&ws_url, label.clone(), &pending, outbound_rx.clone()).await {
            Ok(()) => {
                tracing::info!("cursor-bridge WS closed cleanly; reconnecting");
                backoff = Duration::from_millis(500);
            }
            Err(e) => {
                tracing::warn!(
                    "cursor-bridge WS connection failed: {} — retrying in {:?}",
                    e,
                    backoff
                );
            }
        }
        drain_pending(&pending);
        tokio::time::sleep(backoff).await;
        backoff = std::cmp::min(backoff.saturating_mul(2), MAX_BACKOFF);
    }
}

/// Called when the bridge WS drops mid-wait. We fail every pending tool
/// call with `TIMEOUT_RENEW` so the LLM re-calls — but critically we
/// echo back the EXACT `sessionId` the LLM passed in (stored alongside
/// the sender). Echoing "NEW" here would make the LLM treat the next
/// call as a fresh conversation and fork the whole thing on the
/// backend.
fn drain_pending(pending: &DashMap<String, PendingEntry>) {
    let keys: Vec<String> = pending.iter().map(|e| e.key().clone()).collect();
    for k in keys {
        if let Some((_, entry)) = pending.remove(&k) {
            let _ = entry.tx.send(WaitEnvelope {
                text: TIMEOUT_RENEW.to_string(),
                session_id: entry.original_session_id,
            });
        }
    }
}

async fn connect_and_run(
    ws_url: &str,
    label: Option<String>,
    pending: &Arc<DashMap<String, PendingEntry>>,
    outbound_rx: Arc<AsyncMutex<mpsc::UnboundedReceiver<BridgeInbound>>>,
) -> anyhow::Result<()> {
    tracing::info!("cursor-bridge connecting to {}", ws_url);
    let (ws, _resp) = tokio_tungstenite::connect_async(ws_url).await?;
    let (mut sender, mut receiver) = ws.split();

    let reg = serde_json::to_string(&BridgeInbound::Register {
        version: env!("CARGO_PKG_VERSION").to_string(),
        label,
    })?;
    sender.send(Message::Text(reg.into())).await?;

    let mut ping_interval = tokio::time::interval(PING_INTERVAL);
    ping_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    ping_interval.tick().await;

    let mut outbound_rx = outbound_rx.lock().await;

    loop {
        tokio::select! {
            outbound = outbound_rx.recv() => {
                match outbound {
                    Some(frame) => {
                        let text = serde_json::to_string(&frame)?;
                        sender.send(Message::Text(text.into())).await?;
                    }
                    None => return Ok(()),
                }
            }
            _ = ping_interval.tick() => {
                let p = serde_json::to_string(&BridgeInbound::Ping)?;
                sender.send(Message::Text(p.into())).await?;
            }
            inbound = receiver.next() => {
                match inbound {
                    Some(Ok(Message::Text(text))) => {
                        match serde_json::from_str::<BridgeOutbound>(text.as_ref()) {
                            Ok(BridgeOutbound::Registered) => {
                                tracing::info!("cursor-bridge backend acknowledged registration");
                            }
                            Ok(BridgeOutbound::Pong) => {}
                            Ok(BridgeOutbound::WaitResult { request_id, text, session_id }) => {
                                if let Some((_, entry)) = pending.remove(&request_id) {
                                    let _ = entry.tx.send(WaitEnvelope { text, session_id });
                                } else {
                                    tracing::debug!(
                                        "cursor-bridge got WaitResult for unknown request_id {}",
                                        request_id
                                    );
                                }
                            }
                            Ok(BridgeOutbound::Error { request_id, message }) => {
                                tracing::warn!("cursor-bridge backend error: {}", message);
                                if let Some(rid) = request_id
                                    && let Some((_, entry)) = pending.remove(&rid)
                                {
                                    // Echo the ORIGINAL sessionId so the LLM
                                    // stays on the same conversation.
                                    let session_id = entry.original_session_id.clone();
                                    let _ = entry.tx.send(WaitEnvelope {
                                        text: format!("{}: {}", TIMEOUT_RENEW, message),
                                        session_id,
                                    });
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "cursor-bridge bad inbound JSON: {} ({})",
                                    text,
                                    e
                                );
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        sender.send(Message::Pong(payload)).await.ok();
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        tracing::info!("cursor-bridge backend closed WS");
                        return Ok(());
                    }
                    Some(Ok(Message::Frame(_))) => {}
                    Some(Err(e)) => {
                        return Err(anyhow::anyhow!("cursor-bridge WS recv error: {}", e));
                    }
                    None => return Ok(()),
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn bridge_router_only_has_wait_for_user_input() {
        let svc = CursorBridgeServer::new("http://127.0.0.1:1", None);
        let names: Vec<_> = svc
            .tool_router
            .list_all()
            .into_iter()
            .map(|t| t.name)
            .collect();
        assert_eq!(names, vec!["wait_for_user_input"]);
    }

    #[test]
    fn default_label_includes_host_and_cwd() {
        let l = default_label().expect("label");
        assert!(l.contains('·'));
    }
}
