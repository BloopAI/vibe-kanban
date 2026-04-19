//! Cursor MCP "PChat-like" persistent chat service.
//!
//! When the user picks the `CURSOR_MCP` coding agent, vibe-kanban does NOT
//! spawn an AI subprocess. Instead, the user runs Cursor IDE separately, and
//! Cursor's Composer Agent talks to a small stdio MCP bridge (the
//! `vibe-kanban-mcp --mode cursor-bridge` binary) which connects back to this
//! backend over a WebSocket. The bridge exposes a single tool,
//! `wait_for_user_input`, which blocks Cursor's Agent until the user types a
//! reply in the vibe-kanban session UI.
//!
//! This module is the in-memory rendezvous between:
//! - the **bridge** (over WebSocket / HTTP), and
//! - the **frontend** (which submits user replies via `POST
//!   /api/sessions/:id/follow-up` and renders messages from a per-session
//!   patch stream).
//!
//! It is intentionally analogous to [`crate::services::approvals::Approvals`]:
//! a `DashMap` of pending waits whose resolution is delivered through a
//! `oneshot::Sender`, plus a `broadcast` channel of JSON-patches consumed by
//! the UI WebSocket.

use std::{collections::VecDeque, sync::Arc, time::Duration as StdDuration};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use json_patch::Patch;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{broadcast, oneshot};
use ts_rs::TS;
use uuid::Uuid;

/// Sentinel returned to the bridge (and surfaced to Cursor's Agent) when the
/// pending wait has not been resolved by the user within
/// [`FORCE_RENEW_INTERVAL`]. The Agent is expected to silently re-call
/// `wait_for_user_input`.
pub const TIMEOUT_RENEW: &str = "TIMEOUT_RENEW";

/// Sentinel returned to the bridge when the user cancels a queued wait from
/// the UI. The Agent should treat it as "user dismissed this prompt".
pub const USER_DISMISSED_QUEUE: &str = "__USER_DISMISSED_QUEUE__";

/// Default keep-alive period before the backend force-renews a pending wait.
/// Matches PChat's behaviour and keeps Cursor's MCP timeout from killing the
/// tool call.
pub const FORCE_RENEW_INTERVAL: StdDuration = StdDuration::from_secs(55 * 60);

/// One pending `wait_for_user_input` call from a bridge.
#[derive(Debug)]
struct PendingWait {
    /// The vibe-kanban session this wait is bound to.
    session_id: Uuid,
    /// The assistant message text Cursor wants to display to the user.
    message: String,
    /// Optional hint shown above the input box.
    prompt: Option<String>,
    /// Optional title hint for the session tab.
    title: Option<String>,
    /// When the wait was enqueued.
    enqueued_at: DateTime<Utc>,
    /// Channel that resolves with the user's reply text (or a sentinel).
    response_tx: oneshot::Sender<String>,
}

/// One historical message in a Cursor MCP session conversation.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpMessage {
    pub id: String,
    pub session_id: Uuid,
    /// "assistant" for messages produced by Cursor's Agent via
    /// `wait_for_user_input`, "user" for replies typed in the vibe-kanban UI.
    pub role: CursorMcpRole,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CursorMcpRole {
    Assistant,
    User,
    System,
}

/// Compact info about a wait that is currently sitting in the queue (not yet
/// resolved). Sent to the frontend so it can render a "queued" indicator above
/// the input box.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpWaitInfo {
    pub request_id: String,
    pub session_id: Uuid,
    pub message: String,
    pub prompt: Option<String>,
    pub enqueued_at: DateTime<Utc>,
    /// `enqueued_at + FORCE_RENEW_INTERVAL` — the UI uses this for the
    /// countdown shown next to the wait.
    pub renew_deadline_at: DateTime<Utc>,
}

/// Snapshot of the per-session state, used both for the initial WebSocket
/// frame and for `GET /api/cursor-mcp/sessions/:id/state` REST polling.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpSessionSnapshot {
    pub session_id: Uuid,
    pub messages: Vec<CursorMcpMessage>,
    pub pending_waits: Vec<CursorMcpWaitInfo>,
    pub bridge_connected: bool,
}

/// One frame on the per-session patch stream.
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
#[ts(export)]
pub enum CursorMcpPatch {
    /// Initial / re-sync snapshot.
    Snapshot(CursorMcpSessionSnapshot),
    /// A new message appended.
    MessageAppended(CursorMcpMessage),
    /// A new pending wait enqueued.
    WaitEnqueued(CursorMcpWaitInfo),
    /// A pending wait was resolved (by user or by timeout/renew/dismiss).
    WaitResolved { request_id: String },
    /// Bridge connection state changed.
    BridgeConnected(bool),
}

#[derive(Debug, Error)]
pub enum CursorMcpError {
    #[error("no pending wait for session {0}")]
    NoPendingWait(Uuid),
    #[error("pending wait {0} not found")]
    NotFound(String),
}

/// Per-session live state.
struct SessionState {
    /// Bounded conversation history.
    messages: VecDeque<CursorMcpMessage>,
    /// FIFO of pending waits (front is "currently displayed", rest are queue).
    queue: VecDeque<String>,
    /// True while at least one bridge WebSocket is connected for this session.
    bridge_connected_count: usize,
    /// Live broadcast for UI WebSocket subscribers.
    patches_tx: broadcast::Sender<CursorMcpPatch>,
}

impl SessionState {
    fn new() -> Self {
        let (patches_tx, _) = broadcast::channel(128);
        Self {
            messages: VecDeque::with_capacity(64),
            queue: VecDeque::new(),
            bridge_connected_count: 0,
            patches_tx,
        }
    }
}

const MAX_MESSAGES_PER_SESSION: usize = 200;

/// Public API for the rest of the backend to talk to the Cursor MCP service.
#[derive(Clone)]
pub struct CursorMcpService {
    pending: Arc<DashMap<String, PendingWait>>,
    sessions: Arc<DashMap<Uuid, Arc<tokio::sync::Mutex<SessionState>>>>,
}

impl CursorMcpService {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(DashMap::new()),
            sessions: Arc::new(DashMap::new()),
        }
    }

    /// Bridge → backend: enqueue a new `wait_for_user_input` call. Returns
    /// the future the bridge should `await` for the user reply (or a
    /// sentinel like [`TIMEOUT_RENEW`]).
    ///
    /// `request_id` is generated by the bridge (a UUID is fine).
    pub async fn enqueue_wait(
        &self,
        session_id: Uuid,
        request_id: String,
        message: String,
        prompt: Option<String>,
        title: Option<String>,
    ) -> oneshot::Receiver<String> {
        let (tx, rx) = oneshot::channel();
        let now = Utc::now();
        let pending = PendingWait {
            session_id,
            message: message.clone(),
            prompt: prompt.clone(),
            title,
            enqueued_at: now,
            response_tx: tx,
        };

        let info = CursorMcpWaitInfo {
            request_id: request_id.clone(),
            session_id,
            message: message.clone(),
            prompt: prompt.clone(),
            enqueued_at: now,
            renew_deadline_at: now
                + chrono::Duration::from_std(FORCE_RENEW_INTERVAL)
                    .unwrap_or(chrono::Duration::seconds(60)),
        };

        // Append the assistant message into history first, then push the queue
        // entry. This way UIs that only render `messages` still see the
        // assistant text.
        let assistant_msg = CursorMcpMessage {
            id: format!("msg-{}", Uuid::new_v4()),
            session_id,
            role: CursorMcpRole::Assistant,
            body: message,
            created_at: now,
        };
        self.append_message_internal(session_id, assistant_msg.clone())
            .await;

        // Insert into queue + global pending map.
        self.pending.insert(request_id.clone(), pending);
        let session_arc = self.session_state(session_id);
        {
            let mut state = session_arc.lock().await;
            state.queue.push_back(request_id.clone());
            let _ = state
                .patches_tx
                .send(CursorMcpPatch::WaitEnqueued(info.clone()));
        }

        // Spawn the auto-renew watcher. When it fires, it removes the
        // pending wait, sends `TIMEOUT_RENEW` back to the bridge, and emits
        // a `WaitResolved` patch so the UI clears the indicator.
        self.spawn_renew_watcher(request_id);

        rx
    }

    /// Frontend → backend: resolve the **front** pending wait of a session
    /// with a user reply. Returns whether anything was resolved.
    pub async fn resolve_with_user_reply(&self, session_id: Uuid, text: String) -> bool {
        // Pop the front of the per-session queue.
        let request_id = {
            let session_arc = self.session_state(session_id);
            let mut state = session_arc.lock().await;
            state.queue.pop_front()
        };

        let Some(request_id) = request_id else {
            // No pending wait: just store the user message so it's visible.
            let user_msg = CursorMcpMessage {
                id: format!("msg-{}", Uuid::new_v4()),
                session_id,
                role: CursorMcpRole::User,
                body: text,
                created_at: Utc::now(),
            };
            self.append_message_internal(session_id, user_msg).await;
            return false;
        };

        let Some((_, pending)) = self.pending.remove(&request_id) else {
            // Defensive: drop the queue entry but bail.
            return false;
        };

        // Append user message to history.
        let user_msg = CursorMcpMessage {
            id: format!("msg-{}", Uuid::new_v4()),
            session_id,
            role: CursorMcpRole::User,
            body: text.clone(),
            created_at: Utc::now(),
        };
        self.append_message_internal(session_id, user_msg).await;

        // Notify UI subscribers and bridge.
        {
            let session_arc = self.session_state(session_id);
            let state = session_arc.lock().await;
            let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                request_id: request_id.clone(),
            });
        }
        let _ = pending.response_tx.send(text);
        true
    }

    /// Frontend → backend: cancel a specific queued wait (return a
    /// `__USER_DISMISSED_QUEUE__` sentinel to the bridge).
    pub async fn cancel_wait(&self, session_id: Uuid, request_id: &str) -> bool {
        // Remove from the queue.
        let removed_in_queue = {
            let session_arc = self.session_state(session_id);
            let mut state = session_arc.lock().await;
            if let Some(pos) = state.queue.iter().position(|id| id == request_id) {
                state.queue.remove(pos);
                let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                    request_id: request_id.to_string(),
                });
                true
            } else {
                false
            }
        };

        if let Some((_, pending)) = self.pending.remove(request_id) {
            let _ = pending.response_tx.send(USER_DISMISSED_QUEUE.to_string());
            true
        } else {
            removed_in_queue
        }
    }

    /// Frontend → backend: subscribe to per-session live patches plus an
    /// initial snapshot.
    pub async fn subscribe_session(
        &self,
        session_id: Uuid,
    ) -> (
        CursorMcpSessionSnapshot,
        broadcast::Receiver<CursorMcpPatch>,
    ) {
        let session_arc = self.session_state(session_id);
        let state = session_arc.lock().await;
        let snapshot = self.snapshot_from_state(session_id, &state);
        (snapshot, state.patches_tx.subscribe())
    }

    /// Bridge connection state hook (called on WS connect/disconnect).
    pub async fn set_bridge_connected(&self, session_id: Uuid, connected: bool) {
        let session_arc = self.session_state(session_id);
        let mut state = session_arc.lock().await;
        if connected {
            state.bridge_connected_count = state.bridge_connected_count.saturating_add(1);
        } else {
            state.bridge_connected_count = state.bridge_connected_count.saturating_sub(1);
        }
        let now_connected = state.bridge_connected_count > 0;
        let _ = state
            .patches_tx
            .send(CursorMcpPatch::BridgeConnected(now_connected));
    }

    /// Read-only snapshot for REST GET (or initial WS frame).
    pub async fn snapshot(&self, session_id: Uuid) -> CursorMcpSessionSnapshot {
        let session_arc = self.session_state(session_id);
        let state = session_arc.lock().await;
        self.snapshot_from_state(session_id, &state)
    }

    fn session_state(&self, session_id: Uuid) -> Arc<tokio::sync::Mutex<SessionState>> {
        self.sessions
            .entry(session_id)
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(SessionState::new())))
            .clone()
    }

    fn snapshot_from_state(
        &self,
        session_id: Uuid,
        state: &SessionState,
    ) -> CursorMcpSessionSnapshot {
        let pending_waits = state
            .queue
            .iter()
            .filter_map(|rid| {
                self.pending.get(rid).map(|p| CursorMcpWaitInfo {
                    request_id: rid.clone(),
                    session_id: p.session_id,
                    message: p.message.clone(),
                    prompt: p.prompt.clone(),
                    enqueued_at: p.enqueued_at,
                    renew_deadline_at: p.enqueued_at
                        + chrono::Duration::from_std(FORCE_RENEW_INTERVAL)
                            .unwrap_or(chrono::Duration::seconds(60)),
                })
            })
            .collect();

        CursorMcpSessionSnapshot {
            session_id,
            messages: state.messages.iter().cloned().collect(),
            pending_waits,
            bridge_connected: state.bridge_connected_count > 0,
        }
    }

    async fn append_message_internal(&self, session_id: Uuid, msg: CursorMcpMessage) {
        let session_arc = self.session_state(session_id);
        let mut state = session_arc.lock().await;
        state.messages.push_back(msg.clone());
        while state.messages.len() > MAX_MESSAGES_PER_SESSION {
            state.messages.pop_front();
        }
        let _ = state.patches_tx.send(CursorMcpPatch::MessageAppended(msg));
    }

    fn spawn_renew_watcher(&self, request_id: String) {
        let pending = self.pending.clone();
        let sessions = self.sessions.clone();
        tokio::spawn(async move {
            tokio::time::sleep(FORCE_RENEW_INTERVAL).await;
            let Some((_, pending_wait)) = pending.remove(&request_id) else {
                return;
            };
            // Drop from per-session queue if still present.
            if let Some(session_arc) = sessions.get(&pending_wait.session_id) {
                let mut state = session_arc.lock().await;
                if let Some(pos) = state.queue.iter().position(|id| id == &request_id) {
                    state.queue.remove(pos);
                }
                let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                    request_id: request_id.clone(),
                });
            }
            let _ = pending_wait.response_tx.send(TIMEOUT_RENEW.to_string());
        });
    }

    // Future hook: convert in-memory messages into JSON-patch ops on a
    // matching ExecutionProcess MsgStore so the existing
    // `/api/execution-processes/:id/normalized-logs/ws` works without a
    // dedicated frontend stream. Out of scope for v1.
    #[allow(dead_code)]
    fn _todo_bridge_to_msgstore(&self) -> Patch {
        Patch(vec![])
    }
}

impl Default for CursorMcpService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn enqueue_then_resolve_delivers_user_text() {
        let svc = CursorMcpService::new();
        let session_id = Uuid::new_v4();
        let request_id = format!("req-{}", Uuid::new_v4());

        let rx = svc
            .enqueue_wait(session_id, request_id.clone(), "hello".into(), None, None)
            .await;

        let resolved = svc
            .resolve_with_user_reply(session_id, "hi back".into())
            .await;
        assert!(resolved);

        let reply = tokio::time::timeout(StdDuration::from_secs(1), rx)
            .await
            .expect("response should arrive")
            .expect("oneshot should not be cancelled");
        assert_eq!(reply, "hi back");
    }

    #[tokio::test]
    async fn cancel_wait_returns_dismissal_sentinel() {
        let svc = CursorMcpService::new();
        let session_id = Uuid::new_v4();
        let request_id = format!("req-{}", Uuid::new_v4());

        let rx = svc
            .enqueue_wait(
                session_id,
                request_id.clone(),
                "are you sure?".into(),
                None,
                None,
            )
            .await;

        assert!(svc.cancel_wait(session_id, &request_id).await);
        let reply = tokio::time::timeout(StdDuration::from_secs(1), rx)
            .await
            .expect("response should arrive")
            .expect("oneshot should not be cancelled");
        assert_eq!(reply, USER_DISMISSED_QUEUE);
    }

    #[tokio::test]
    async fn snapshot_includes_history_and_pending() {
        let svc = CursorMcpService::new();
        let session_id = Uuid::new_v4();
        let _rx = svc
            .enqueue_wait(session_id, "req-A".into(), "first".into(), None, None)
            .await;
        let _rx2 = svc
            .enqueue_wait(session_id, "req-B".into(), "second".into(), None, None)
            .await;
        let snap = svc.snapshot(session_id).await;
        assert_eq!(snap.messages.len(), 2);
        assert_eq!(snap.pending_waits.len(), 2);
        assert_eq!(snap.pending_waits[0].request_id, "req-A");
    }
}
