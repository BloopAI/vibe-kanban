//! Cursor MCP "PChat-like" persistent chat service — **v4 lobby model**.
//!
//! ## Big picture (v4)
//!
//! 1. The user mounts ONE **global** `vibe-kanban-mcp --mode cursor-bridge`
//!    in `~/.cursor/mcp.json` — no `--workspace-id`, no per-workspace
//!    setup.
//! 2. Cursor's Composer Agent calls `wait_for_user_input(sessionId="NEW")`
//!    on the bridge. The bridge forwards the call over WebSocket to this
//!    service.
//! 3. First time we see a `bridge_session_id`, we create a row in the
//!    `cursor_mcp_lobby_sessions` table and broadcast
//!    [`InboxPatch::SessionUpdated`] to every UI that's watching the
//!    global Inbox.
//! 4. The user opens the vibe-kanban Create Workspace page, sees the
//!    Inbox lobby list, picks a conversation, and creates a workspace
//!    from it. The routes layer then calls
//!    [`CursorMcpService::adopt_lobby_session`] to record the
//!    `bridge_session_id → vk_session_id` binding (also persisted in the
//!    lobby DB row's `adopted_into_session_id` column).
//! 5. From that point on, every `wait_for_user_input` with the same
//!    `bridge_session_id` routes directly to the adopted vk session
//!    (bypassing the lobby).
//!
//! ## Key data structures
//!
//! - `bridge_to_vk: DashMap<String, Uuid>` — adopted-route table. Loaded
//!   from DB at startup so a backend restart doesn't break in-progress
//!   Composer chats.
//! - `lobby_state: DashMap<String, LobbySessionState>` — per-bridge-session
//!   in-memory queue + message buffer for sessions that haven't been
//!   adopted yet.
//! - `vk_session_state: DashMap<Uuid, VkSessionState>` — per-vk-session
//!   in-memory queue + message buffer for adopted sessions (same data
//!   shape as v3 `SessionState`).
//! - `bridges: RwLock<Vec<Arc<BridgeHandle>>>` — connected bridge WS
//!   handles. Workspace-agnostic (drop in v4).
//! - `inbox_patches_tx: broadcast::Sender<InboxPatch>` — single global
//!   patch stream consumed by the Inbox UI.

use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration as StdDuration, Instant},
};

use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::{DBService, models::cursor_mcp_lobby::CursorMcpLobbySession};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::{Mutex, RwLock, broadcast, mpsc, oneshot};
use ts_rs::TS;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Sentinels
// ---------------------------------------------------------------------------

pub const TIMEOUT_RENEW: &str = "TIMEOUT_RENEW";
pub const USER_DISMISSED_QUEUE: &str = "__USER_DISMISSED_QUEUE__";

pub const FORCE_RENEW_INTERVAL: StdDuration = StdDuration::from_secs(55 * 60);
pub const BRIDGE_PING_INTERVAL: StdDuration = StdDuration::from_secs(30);
pub const BRIDGE_PONG_TIMEOUT: StdDuration = StdDuration::from_secs(60);

/// A lobby session is considered "live" for the UI picker if it either has
/// at least one pending `wait_for_user_input` call, or its last activity
/// (initial upsert or the most recent renew) was within this window. Past
/// the window with no pending wait, the entry is considered stale and the
/// inbox GC task emits a [`InboxPatch::SessionRemoved`] so the picker drops
/// it; the DB row itself is left in place until a higher-level cleanup runs.
pub const FRESH_LOBBY_WINDOW: StdDuration = StdDuration::from_secs(120);

/// How often the background lobby GC task sweeps for newly-stale lobby
/// entries. Picked short enough that the picker feels live without
/// hammering the DB.
pub const LOBBY_GC_INTERVAL: StdDuration = StdDuration::from_secs(30);

const MAX_MESSAGES_PER_SESSION: usize = 200;

// ---------------------------------------------------------------------------
// Wire protocol — bridge <-> backend WebSocket
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum BridgeInbound {
    /// First frame after the WS handshake. `version` is the bridge's
    /// protocol version (e.g. `"1.0"`); `label` is a human-readable hint
    /// the bridge derives from its environment (typically
    /// `<hostname> · <cwd>`) so the Inbox picker can disambiguate which
    /// machine / Cursor window produced a conversation.
    Register {
        version: String,
        #[serde(default)]
        label: Option<String>,
    },
    /// `wait_for_user_input` invocation.
    Wait {
        request_id: String,
        bridge_session_id: String,
        message: String,
        #[serde(default)]
        prompt: Option<String>,
        #[serde(default)]
        title: Option<String>,
    },
    CancelWait {
        request_id: String,
    },
    Ping,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum BridgeOutbound {
    Registered,
    WaitResult {
        request_id: String,
        text: String,
        session_id: String,
    },
    Error {
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        message: String,
    },
    Pong,
}

// ---------------------------------------------------------------------------
// Per-conversation message + queue types (shared by lobby and vk-session
// state).
// ---------------------------------------------------------------------------

#[derive(Debug)]
struct PendingWait {
    /// String identifying which conversation this pending wait belongs to.
    /// For adopted sessions this is the bridge_session_id; for lobby
    /// sessions it's also the bridge_session_id.
    bridge_session_id: String,
    message: String,
    prompt: Option<String>,
    #[allow(dead_code)]
    title: Option<String>,
    enqueued_at: DateTime<Utc>,
    response_tx: oneshot::Sender<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpMessage {
    pub id: String,
    /// vk_session_id when adopted, else `None` (lobby).
    pub vk_session_id: Option<Uuid>,
    /// Always set — friendly bridge id.
    pub bridge_session_id: String,
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

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpWaitInfo {
    pub request_id: String,
    /// vk_session_id when adopted, else `None` (lobby).
    pub vk_session_id: Option<Uuid>,
    pub bridge_session_id: String,
    pub message: String,
    pub prompt: Option<String>,
    pub enqueued_at: DateTime<Utc>,
    pub renew_deadline_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CursorMcpSessionSnapshot {
    pub session_id: Uuid,
    pub bridge_session_id: Option<String>,
    pub messages: Vec<CursorMcpMessage>,
    pub pending_waits: Vec<CursorMcpWaitInfo>,
    pub bridge_connected: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
#[ts(export)]
pub enum CursorMcpPatch {
    Snapshot(CursorMcpSessionSnapshot),
    MessageAppended(CursorMcpMessage),
    WaitEnqueued(CursorMcpWaitInfo),
    WaitResolved { request_id: String },
    BridgeConnected(bool),
}

#[derive(Debug, Error)]
pub enum CursorMcpError {
    #[error("lobby session {0} not found")]
    LobbyNotFound(String),
    #[error("lobby session {0} already adopted")]
    LobbyAlreadyAdopted(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct AdoptedLobbySession {
    pub migrated_messages: Vec<CursorMcpMessage>,
}

// ---------------------------------------------------------------------------
// Per-conversation runtime state (shared by lobby + vk-session variants)
// ---------------------------------------------------------------------------

struct ConversationState {
    messages: VecDeque<CursorMcpMessage>,
    queue: VecDeque<String>,
    patches_tx: broadcast::Sender<CursorMcpPatch>,
}

impl ConversationState {
    fn new() -> Self {
        let (patches_tx, _) = broadcast::channel(128);
        Self {
            messages: VecDeque::with_capacity(64),
            queue: VecDeque::new(),
            patches_tx,
        }
    }
}

// ---------------------------------------------------------------------------
// Inbox (workspace-agnostic, global) — patch stream for the Create Workspace
// page and any other UI that wants to see all bridges + lobby sessions.
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InboxBridgeInfo {
    pub bridge_id: Uuid,
    pub label: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InboxLobbyItem {
    pub bridge_session_id: String,
    pub bridge_label: Option<String>,
    pub title: Option<String>,
    pub first_message: Option<String>,
    pub last_activity_at: DateTime<Utc>,
    pub pending_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InboxSnapshot {
    pub bridges: Vec<InboxBridgeInfo>,
    pub lobby: Vec<InboxLobbyItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
#[ts(export)]
pub enum InboxPatch {
    Snapshot(InboxSnapshot),
    BridgesChanged {
        count: usize,
    },
    SessionUpdated(InboxLobbyItem),
    SessionAdopted {
        bridge_session_id: String,
        vk_session_id: Uuid,
    },
    SessionRemoved {
        bridge_session_id: String,
    },
}

// ---------------------------------------------------------------------------
// Bridge connection handle
// ---------------------------------------------------------------------------

pub struct BridgeHandle {
    pub bridge_id: Uuid,
    pub label: RwLock<Option<String>>,
    pub send_tx: mpsc::UnboundedSender<BridgeOutbound>,
    pub last_seen: Mutex<Instant>,
}

impl std::fmt::Debug for BridgeHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("BridgeHandle")
            .field("bridge_id", &self.bridge_id)
            .finish()
    }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct CursorMcpService {
    pending: Arc<DashMap<String, PendingWait>>,
    /// Owning `bridge_id` for each in-flight `request_id`. Populated by
    /// the WS handler via [`tag_pending_bridge`] right after
    /// [`Self::enqueue_wait`] returns. On bridge disconnect we walk this
    /// map and drop every pending wait the dying bridge owned so stale
    /// lobby rows stop showing `N waiting` forever. Request ids that
    /// pre-date tagging (e.g. tests) are simply untracked here.
    pending_bridges: Arc<DashMap<String, Uuid>>,
    /// Per-bridge_session_id state for lobby (unadopted) conversations.
    lobby_state: Arc<DashMap<String, Arc<Mutex<ConversationState>>>>,
    /// Per-vk_session_id state for adopted conversations.
    vk_session_state: Arc<DashMap<Uuid, Arc<Mutex<ConversationState>>>>,
    /// Adopted-route table. Loaded from DB at startup.
    bridge_to_vk: Arc<DashMap<String, Uuid>>,
    vk_to_bridge: Arc<DashMap<Uuid, String>>,
    /// Connected bridges (workspace-agnostic).
    bridges: Arc<RwLock<Vec<Arc<BridgeHandle>>>>,
    /// Patch broadcast for the global Inbox UI.
    inbox_patches_tx: Arc<broadcast::Sender<InboxPatch>>,
    /// DB pool for lobby persistence.
    db: DBService,
    /// Monotonic counter for bridge ids in logs.
    next_bridge_seq: Arc<AtomicUsize>,
}

impl CursorMcpService {
    pub fn new(db: DBService) -> Self {
        let (inbox_tx, _) = broadcast::channel(128);
        let service = Self {
            pending: Arc::new(DashMap::new()),
            pending_bridges: Arc::new(DashMap::new()),
            lobby_state: Arc::new(DashMap::new()),
            vk_session_state: Arc::new(DashMap::new()),
            bridge_to_vk: Arc::new(DashMap::new()),
            vk_to_bridge: Arc::new(DashMap::new()),
            bridges: Arc::new(RwLock::new(Vec::new())),
            inbox_patches_tx: Arc::new(inbox_tx),
            db,
            next_bridge_seq: Arc::new(AtomicUsize::new(0)),
        };
        service.spawn_lobby_gc();
        service
    }

    /// Rehydrate the in-memory `bridge_to_vk` routing table from the DB.
    /// Call this once at backend startup.
    pub async fn rehydrate_adopted(&self) -> Result<(), sqlx::Error> {
        let rows = CursorMcpLobbySession::list_adopted(&self.db.pool).await?;
        for (bridge_id, vk_id) in rows {
            self.bridge_to_vk.insert(bridge_id.clone(), vk_id);
            self.vk_to_bridge.insert(vk_id, bridge_id);
        }
        Ok(())
    }

    /// Whether a lobby item should be surfaced in the Inbox picker. Items
    /// with at least one pending wait are always live; otherwise we give a
    /// short grace window after `last_activity_at` so the two consecutive
    /// `wait_for_user_input` calls in a chat don't cause a flicker in the
    /// UI (the picker would otherwise briefly drop the row between waits).
    pub fn is_fresh_lobby_item(item: &InboxLobbyItem, now: DateTime<Utc>) -> bool {
        if item.pending_count > 0 {
            return true;
        }
        let window = chrono::Duration::from_std(FRESH_LOBBY_WINDOW)
            .unwrap_or_else(|_| chrono::Duration::seconds(120));
        now.signed_duration_since(item.last_activity_at) <= window
    }

    /// Compute the current set of lobby ids that pass the freshness gate.
    /// Pulled out of [`spawn_lobby_gc`] for testability.
    async fn current_fresh_lobby_ids(&self) -> Result<HashSet<String>, sqlx::Error> {
        let rows = CursorMcpLobbySession::list_unadopted(&self.db.pool).await?;
        let now = Utc::now();
        let mut out = HashSet::new();
        for r in rows {
            let pending_count = if let Some(state_arc) = self.lobby_state.get(&r.bridge_session_id)
            {
                state_arc.lock().await.queue.len()
            } else {
                0
            };
            let item = InboxLobbyItem {
                bridge_session_id: r.bridge_session_id.clone(),
                bridge_label: r.bridge_label,
                title: r.title,
                first_message: r.first_message,
                last_activity_at: r.last_activity_at,
                pending_count,
            };
            if Self::is_fresh_lobby_item(&item, now) {
                out.insert(item.bridge_session_id);
            }
        }
        Ok(out)
    }

    /// Run a single lobby-GC sweep. Emits [`InboxPatch::SessionRemoved`]
    /// for every id that was in `previously_fresh` but has since crossed
    /// [`FRESH_LOBBY_WINDOW`] with no pending wait. Returns the new
    /// fresh-ids set so the caller can carry it into the next sweep.
    pub async fn sweep_stale_lobby_entries(
        &self,
        previously_fresh: &HashSet<String>,
    ) -> HashSet<String> {
        let currently_fresh = match self.current_fresh_lobby_ids().await {
            Ok(ids) => ids,
            Err(e) => {
                tracing::warn!("lobby GC: DB query failed: {}", e);
                return previously_fresh.clone();
            }
        };
        for stale in previously_fresh.difference(&currently_fresh) {
            let _ = self.inbox_patches_tx.send(InboxPatch::SessionRemoved {
                bridge_session_id: stale.clone(),
            });
        }
        currently_fresh
    }

    /// Sweep for lobby entries that used to be fresh but have crossed the
    /// [`FRESH_LOBBY_WINDOW`] with no pending waits, and emit
    /// [`InboxPatch::SessionRemoved`] so the picker drops them. Leaves the
    /// DB rows in place — adoption history and longer-term cleanup are
    /// intentionally a separate concern.
    fn spawn_lobby_gc(&self) {
        let svc = self.clone();
        tokio::spawn(async move {
            let mut previously_fresh: HashSet<String> = HashSet::new();
            let mut interval = tokio::time::interval(LOBBY_GC_INTERVAL);
            interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            interval.tick().await; // consume the immediate first tick
            loop {
                interval.tick().await;
                previously_fresh = svc.sweep_stale_lobby_entries(&previously_fresh).await;
            }
        });
    }

    // ---- bridge connections ----------------------------------------------

    pub async fn register_bridge(
        &self,
    ) -> (Arc<BridgeHandle>, mpsc::UnboundedReceiver<BridgeOutbound>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let bridge_id = Uuid::new_v4();
        let _ = self.next_bridge_seq.fetch_add(1, Ordering::Relaxed);
        let handle = Arc::new(BridgeHandle {
            bridge_id,
            label: RwLock::new(None),
            send_tx: tx,
            last_seen: Mutex::new(Instant::now()),
        });

        let count = {
            let mut lock = self.bridges.write().await;
            lock.push(handle.clone());
            lock.len()
        };
        let _ = self
            .inbox_patches_tx
            .send(InboxPatch::BridgesChanged { count });
        (handle, rx)
    }

    pub async fn set_bridge_label(&self, bridge: &BridgeHandle, label: Option<String>) {
        let mut lock = bridge.label.write().await;
        *lock = label;
    }

    pub async fn unregister_bridge(&self, bridge: &BridgeHandle) {
        let count = {
            let mut lock = self.bridges.write().await;
            lock.retain(|b| b.bridge_id != bridge.bridge_id);
            lock.len()
        };

        // Drop every pending wait this bridge owned. Without this, the
        // lobby picker keeps showing "N waiting" for conversations whose
        // Cursor tab (and therefore the in-process oneshot receiver) is
        // gone — we'd never replay those oneshots, so `pending_count`
        // would stay > 0 forever and `is_fresh_lobby_item` would keep
        // the rows visible. Only the disconnecting bridge's waits are
        // dropped; other bridges keep their queues.
        self.drop_pending_for_bridge(bridge.bridge_id).await;

        let _ = self
            .inbox_patches_tx
            .send(InboxPatch::BridgesChanged { count });
    }

    /// Register the owning `bridge_id` for a previously-enqueued wait so
    /// [`Self::unregister_bridge`] can clean up when that bridge drops.
    /// Safe to call for ids that were never enqueued (no-op). Clearing
    /// happens implicitly whenever the wait is resolved/dismissed.
    pub fn tag_pending_bridge(&self, request_id: &str, bridge_id: Uuid) {
        self.pending_bridges
            .insert(request_id.to_string(), bridge_id);
    }

    async fn drop_pending_for_bridge(&self, bridge_id: Uuid) {
        let doomed: Vec<String> = self
            .pending_bridges
            .iter()
            .filter_map(|e| (*e.value() == bridge_id).then(|| e.key().clone()))
            .collect();
        if doomed.is_empty() {
            return;
        }

        // Group by bridge_session_id so we only touch each lobby/vk
        // ConversationState once, then emit a single inbox patch per
        // affected session.
        let mut by_session: HashMap<String, Vec<String>> = HashMap::new();
        for rid in &doomed {
            self.pending_bridges.remove(rid);
            if let Some((_, pending)) = self.pending.remove(rid) {
                // Dropping `response_tx` also unblocks the MCP-side
                // awaiter with a closed-channel error; bridge code
                // treats that as a TIMEOUT_RENEW so nothing hangs.
                drop(pending.response_tx);
                by_session
                    .entry(pending.bridge_session_id)
                    .or_default()
                    .push(rid.clone());
            }
        }

        for (bridge_session_id, rids) in by_session {
            // Prefer the vk queue when this session was adopted.
            if let Some(vk_id) = self.resolve_bridge_session(&bridge_session_id) {
                if let Some(state_arc) = self.vk_session_state.get(&vk_id) {
                    let mut state = state_arc.lock().await;
                    state.queue.retain(|r| !rids.contains(r));
                    for rid in &rids {
                        let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                            request_id: rid.clone(),
                        });
                    }
                }
                continue;
            }

            // Lobby conversation: drop queued entries and force the
            // picker to re-evaluate freshness now that the pending
            // count is (usually) back to zero.
            let pending_count = if let Some(state_arc) = self.lobby_state.get(&bridge_session_id) {
                let mut state = state_arc.lock().await;
                state.queue.retain(|r| !rids.contains(r));
                for rid in &rids {
                    let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                        request_id: rid.clone(),
                    });
                }
                state.queue.len()
            } else {
                0
            };

            if pending_count == 0 {
                // Best-effort: the GC normally enforces the freshness
                // window; sending SessionRemoved here makes the picker
                // drop the row immediately when the bridge drops.
                let _ = self.inbox_patches_tx.send(InboxPatch::SessionRemoved {
                    bridge_session_id: bridge_session_id.clone(),
                });
            } else if let Some(state_arc) = self.lobby_state.get(&bridge_session_id) {
                let state = state_arc.lock().await;
                let item = self.lobby_item_for(&bridge_session_id, &state).await;
                let _ = self.inbox_patches_tx.send(InboxPatch::SessionUpdated(item));
            }
        }
    }

    pub async fn note_bridge_inbound(&self, bridge: &BridgeHandle) {
        let mut last = bridge.last_seen.lock().await;
        *last = Instant::now();
    }

    pub async fn bridge_is_stale(&self, bridge: &BridgeHandle) -> bool {
        let last = bridge.last_seen.lock().await;
        last.elapsed() > BRIDGE_PONG_TIMEOUT
    }

    pub async fn bridge_count(&self) -> usize {
        self.bridges.read().await.len()
    }

    // ---- adoption mapping -------------------------------------------------

    pub fn resolve_bridge_session(&self, bridge_session_id: &str) -> Option<Uuid> {
        self.bridge_to_vk.get(bridge_session_id).map(|v| *v)
    }

    pub fn bridge_session_for_vk(&self, vk_session_id: Uuid) -> Option<String> {
        self.vk_to_bridge.get(&vk_session_id).map(|v| v.clone())
    }

    /// Heal `vk_to_bridge` / `bridge_to_vk` from the lobby table when the
    /// in-memory map is missing (cold start before `rehydrate_adopted`,
    /// or a process that never observed the adopt handler's inserts).
    /// Without this, `session_snapshot` shows `bridge_session_id: null`
    /// and `/resolve` pops an empty vk queue even though a wait is still
    /// sitting in `lobby_state` from a routing race.
    pub async fn heal_bridge_mapping_for_vk(&self, vk_session_id: Uuid) -> Option<String> {
        if let Some(b) = self.bridge_session_for_vk(vk_session_id) {
            return Some(b);
        }
        let Ok(Some(bridge_id)) =
            CursorMcpLobbySession::find_bridge_for_vk_session(&self.db.pool, vk_session_id).await
        else {
            return None;
        };
        self.bridge_to_vk.insert(bridge_id.clone(), vk_session_id);
        self.vk_to_bridge.insert(vk_session_id, bridge_id.clone());
        Some(bridge_id)
    }

    /// Pop the front `request_id` from the vk session queue. If the vk
    /// queue is empty but a matching lobby queue still holds waits (e.g.
    /// `enqueue_wait` routed to lobby before `heal_bridge_mapping`
    /// ran), drain lobby → vk first.
    async fn pop_next_resolve_request_id(&self, vk_session_id: Uuid) -> Option<String> {
        let state_arc = self.ensure_vk_session_state(vk_session_id);

        {
            let mut vk = state_arc.lock().await;
            if let Some(rid) = vk.queue.pop_front() {
                return Some(rid);
            }
        }

        if let Some(bridge_id) = self.heal_bridge_mapping_for_vk(vk_session_id).await {
            if let Some(lobby_arc) = self.lobby_state.get(&bridge_id) {
                let mut lobby = lobby_arc.lock().await;
                if !lobby.queue.is_empty() {
                    let mut vk = state_arc.lock().await;
                    while let Some(rid) = lobby.queue.pop_front() {
                        vk.queue.push_back(rid);
                    }
                }
            }
        }

        let mut vk = state_arc.lock().await;
        vk.queue.pop_front()
    }

    /// Adopt a lobby session into a freshly-created vk session. Updates
    /// both the DB row (so survives restart) and the in-memory routing
    /// table, then broadcasts an `InboxPatch::SessionAdopted`. After this
    /// returns, future `wait_for_user_input` calls with the same
    /// `bridge_session_id` route directly to the vk session.
    pub async fn adopt_lobby_session(
        &self,
        bridge_session_id: &str,
        vk_session_id: Uuid,
    ) -> Result<AdoptedLobbySession, CursorMcpError> {
        // 1. DB UPDATE (atomic check-and-set via UPDATE ... WHERE ...
        //    adopted_into_session_id IS NULL RETURNING ...).
        match CursorMcpLobbySession::adopt(&self.db.pool, bridge_session_id, vk_session_id).await {
            Ok(_) => {}
            Err(sqlx::Error::RowNotFound) => {
                if let Ok(Some(existing)) =
                    CursorMcpLobbySession::find(&self.db.pool, bridge_session_id).await
                    && existing.adopted_into_session_id.is_some()
                {
                    return Err(CursorMcpError::LobbyAlreadyAdopted(
                        bridge_session_id.to_string(),
                    ));
                }
                return Err(CursorMcpError::LobbyNotFound(bridge_session_id.to_string()));
            }
            Err(e) => return Err(CursorMcpError::Db(e)),
        }

        // 2. Move any existing lobby ConversationState into the vk-session
        //    slot so pending waits / history survive adoption.
        let vk_state = match self.lobby_state.remove(bridge_session_id) {
            Some((_, state)) => state,
            None => Arc::new(Mutex::new(ConversationState::new())),
        };
        let mut migrated_messages = {
            let state = vk_state.lock().await;
            state.messages.iter().cloned().collect::<Vec<_>>()
        };
        self.vk_session_state
            .insert(vk_session_id, vk_state.clone());

        // 3. Install the adopted-route mapping. From here on, any new
        //    `enqueue_wait` call with this `bridge_session_id` observes
        //    adoption and writes directly into `vk_state` instead of
        //    `lobby_state`.
        self.bridge_to_vk
            .insert(bridge_session_id.to_string(), vk_session_id);
        self.vk_to_bridge
            .insert(vk_session_id, bridge_session_id.to_string());

        // 4. Race-recovery drain. A `Wait` frame that arrived between
        //    step 1 and step 3 would have routed to lobby; fold that
        //    into the now-canonical `vk_state` so it still gets
        //    resolved when the user replies.
        if let Some((_, late_state)) = self.lobby_state.remove(bridge_session_id) {
            let mut late = late_state.lock().await;
            let mut canonical = vk_state.lock().await;
            for msg in late.messages.drain(..) {
                migrated_messages.push(msg.clone());
                canonical.messages.push_back(msg.clone());
                let _ = canonical
                    .patches_tx
                    .send(CursorMcpPatch::MessageAppended(msg));
            }
            while canonical.messages.len() > MAX_MESSAGES_PER_SESSION {
                canonical.messages.pop_front();
            }
            for rid in late.queue.drain(..) {
                if let Some(info) = self.pending_wait_info(&rid, Some(vk_session_id)) {
                    canonical.queue.push_back(rid.clone());
                    let _ = canonical
                        .patches_tx
                        .send(CursorMcpPatch::WaitEnqueued(info));
                }
            }
        }

        let _ = self.inbox_patches_tx.send(InboxPatch::SessionAdopted {
            bridge_session_id: bridge_session_id.to_string(),
            vk_session_id,
        });
        Ok(AdoptedLobbySession { migrated_messages })
    }

    fn pending_wait_info(
        &self,
        request_id: &str,
        vk_session_id: Option<Uuid>,
    ) -> Option<CursorMcpWaitInfo> {
        self.pending.get(request_id).map(|p| CursorMcpWaitInfo {
            request_id: request_id.to_string(),
            vk_session_id,
            bridge_session_id: p.bridge_session_id.clone(),
            message: p.message.clone(),
            prompt: p.prompt.clone(),
            enqueued_at: p.enqueued_at,
            renew_deadline_at: p.enqueued_at
                + chrono::Duration::from_std(FORCE_RENEW_INTERVAL)
                    .unwrap_or(chrono::Duration::seconds(60)),
        })
    }

    /// Manually delete a lobby entry (no associated workspace, gone).
    pub async fn delete_lobby_session(
        &self,
        bridge_session_id: &str,
    ) -> Result<(), CursorMcpError> {
        let n = CursorMcpLobbySession::delete(&self.db.pool, bridge_session_id).await?;
        if n == 0 {
            return Err(CursorMcpError::LobbyNotFound(bridge_session_id.to_string()));
        }
        // Clean up in-memory state too.
        self.lobby_state.remove(bridge_session_id);
        // Cancel any in-flight waits — they get the dismissal sentinel.
        let request_ids: Vec<String> = self
            .pending
            .iter()
            .filter_map(|e| {
                if e.value().bridge_session_id == bridge_session_id {
                    Some(e.key().clone())
                } else {
                    None
                }
            })
            .collect();
        for rid in request_ids {
            self.pending_bridges.remove(&rid);
            if let Some((_, p)) = self.pending.remove(&rid) {
                let _ = p.response_tx.send(USER_DISMISSED_QUEUE.to_string());
            }
        }
        let _ = self.inbox_patches_tx.send(InboxPatch::SessionRemoved {
            bridge_session_id: bridge_session_id.to_string(),
        });
        Ok(())
    }

    pub fn forget_bridge_session(&self, vk_session_id: Uuid) {
        if let Some((_, bridge_id)) = self.vk_to_bridge.remove(&vk_session_id) {
            self.bridge_to_vk.remove(&bridge_id);
        }
    }

    pub fn generate_friendly_bridge_session_id(&self) -> String {
        let raw = Uuid::new_v4().simple().to_string();
        let head = &raw[..8];
        format!("{}-{}", &head[..4], &head[4..8])
    }

    // ---- inbox subscriptions / snapshot ---------------------------------

    pub async fn subscribe_inbox(&self) -> (InboxSnapshot, broadcast::Receiver<InboxPatch>) {
        let snap = self.inbox_snapshot().await;
        (snap, self.inbox_patches_tx.subscribe())
    }

    pub async fn inbox_snapshot(&self) -> InboxSnapshot {
        let bridges_lock = self.bridges.read().await;
        let mut bridges = Vec::with_capacity(bridges_lock.len());
        for b in bridges_lock.iter() {
            bridges.push(InboxBridgeInfo {
                bridge_id: b.bridge_id,
                label: b.label.read().await.clone(),
            });
        }
        drop(bridges_lock);

        let now = Utc::now();
        let lobby = match CursorMcpLobbySession::list_unadopted(&self.db.pool).await {
            Ok(rows) => {
                let mut items = Vec::with_capacity(rows.len());
                for r in rows {
                    let pending_count =
                        if let Some(state_arc) = self.lobby_state.get(&r.bridge_session_id) {
                            let state = state_arc.lock().await;
                            state.queue.len()
                        } else {
                            0
                        };
                    let item = InboxLobbyItem {
                        bridge_session_id: r.bridge_session_id,
                        bridge_label: r.bridge_label,
                        title: r.title,
                        first_message: r.first_message,
                        last_activity_at: r.last_activity_at,
                        pending_count,
                    };
                    if Self::is_fresh_lobby_item(&item, now) {
                        items.push(item);
                    }
                }
                items
            }
            Err(e) => {
                tracing::warn!("inbox_snapshot: lobby DB query failed: {}", e);
                Vec::new()
            }
        };

        InboxSnapshot { bridges, lobby }
    }

    // ---- per-vk-session subscription (chat banner) ----------------------

    /// Subscribe to a vk session's live patch stream. If no in-memory
    /// state exists yet (e.g. the session has never received a wait),
    /// one is created on demand so the subscriber gets a valid
    /// `Receiver` even if the first `wait_for_user_input` arrives later.
    pub async fn subscribe_session(
        &self,
        session_id: Uuid,
    ) -> (
        CursorMcpSessionSnapshot,
        broadcast::Receiver<CursorMcpPatch>,
    ) {
        let _ = self.heal_bridge_mapping_for_vk(session_id).await;
        let state_arc = self.ensure_vk_session_state(session_id);
        let state = state_arc.lock().await;
        let snapshot = self.session_snapshot_from_state(session_id, &state).await;
        (snapshot, state.patches_tx.subscribe())
    }

    /// Read-only snapshot; does NOT allocate state for unknown sessions.
    /// Prevents a slow memory leak when a lot of vk sessions are opened
    /// and never get Cursor MCP traffic.
    pub async fn session_snapshot(&self, session_id: Uuid) -> CursorMcpSessionSnapshot {
        let _ = self.heal_bridge_mapping_for_vk(session_id).await;
        let bridge_connected = self.bridge_count().await > 0;
        let bridge_session_id = self.bridge_session_for_vk(session_id);
        match self.vk_session_state.get(&session_id).map(|v| v.clone()) {
            Some(state_arc) => {
                let state = state_arc.lock().await;
                self.session_snapshot_from_state(session_id, &state).await
            }
            None => CursorMcpSessionSnapshot {
                session_id,
                bridge_session_id,
                messages: Vec::new(),
                pending_waits: Vec::new(),
                bridge_connected,
            },
        }
    }

    /// Drop in-memory state for a vk session. Call this when the vk
    /// session itself is deleted so we don't leak `ConversationState`
    /// across long-running backends. Safe to call on unknown ids.
    pub fn forget_vk_session(&self, session_id: Uuid) {
        self.vk_session_state.remove(&session_id);
        self.forget_bridge_session(session_id);
    }

    fn ensure_vk_session_state(&self, session_id: Uuid) -> Arc<Mutex<ConversationState>> {
        self.vk_session_state
            .entry(session_id)
            .or_insert_with(|| Arc::new(Mutex::new(ConversationState::new())))
            .clone()
    }

    fn ensure_lobby_session_state(&self, bridge_session_id: &str) -> Arc<Mutex<ConversationState>> {
        if let Some(arc) = self.lobby_state.get(bridge_session_id) {
            return arc.clone();
        }
        let arc = Arc::new(Mutex::new(ConversationState::new()));
        self.lobby_state
            .insert(bridge_session_id.to_string(), arc.clone());
        arc
    }

    async fn session_snapshot_from_state(
        &self,
        session_id: Uuid,
        state: &ConversationState,
    ) -> CursorMcpSessionSnapshot {
        let pending_waits = state
            .queue
            .iter()
            .filter_map(|rid| {
                self.pending.get(rid).map(|p| CursorMcpWaitInfo {
                    request_id: rid.clone(),
                    vk_session_id: Some(session_id),
                    bridge_session_id: p.bridge_session_id.clone(),
                    message: p.message.clone(),
                    prompt: p.prompt.clone(),
                    enqueued_at: p.enqueued_at,
                    renew_deadline_at: p.enqueued_at
                        + chrono::Duration::from_std(FORCE_RENEW_INTERVAL)
                            .unwrap_or(chrono::Duration::seconds(60)),
                })
            })
            .collect();
        let bridge_session_id = self.bridge_session_for_vk(session_id);
        let bridge_connected = self.bridge_count().await > 0;
        CursorMcpSessionSnapshot {
            session_id,
            bridge_session_id,
            messages: state.messages.iter().cloned().collect(),
            pending_waits,
            bridge_connected,
        }
    }

    // ---- enqueue / resolve ------------------------------------------------

    /// Bridge → backend: receives a `wait_for_user_input` invocation.
    /// Returns the future the bridge should `await` for the user reply
    /// (or a sentinel like [`TIMEOUT_RENEW`]).
    ///
    /// `bridge_label` is the optional connection label captured at
    /// register time — used only for the lobby UI's display.
    pub async fn enqueue_wait(
        &self,
        bridge_session_id: String,
        bridge_label: Option<String>,
        request_id: String,
        message: String,
        prompt: Option<String>,
        title: Option<String>,
    ) -> oneshot::Receiver<String> {
        let (tx, rx) = oneshot::channel();
        let now = Utc::now();

        // Decide which conversation state owns this wait.
        //
        // Primary route: in-memory `bridge_to_vk` map (populated by
        // `adopt_lobby_session` and rehydrated from DB at startup).
        //
        // Fallback: DB `adopted_into_session_id`. This closes a small
        // race window where the adoption flow (`workspaces/create.rs`)
        // has already written the DB row + spawned the placeholder
        // ExecutionProcess, but the in-memory `bridge_to_vk.insert`
        // hasn't been observed yet by a concurrent `wait_for_user_input`
        // that's already mid-flight. Without this, the wait would route
        // to lobby and the assistant message would never reach the
        // adopted vk session's MsgStore — symptom: brand new
        // CURSOR_MCP workspace shows an empty chat panel even though
        // the bridge banner reads "1 waiting for your reply".
        let mut routed_vk = self.resolve_bridge_session(&bridge_session_id);
        if routed_vk.is_none()
            && let Ok(Some(row)) =
                CursorMcpLobbySession::find(&self.db.pool, &bridge_session_id).await
            && let Some(vk_id) = row.adopted_into_session_id
        {
            // Heal the in-memory map so future waits skip the DB hop.
            self.bridge_to_vk.insert(bridge_session_id.clone(), vk_id);
            self.vk_to_bridge.insert(vk_id, bridge_session_id.clone());
            routed_vk = Some(vk_id);
        }

        let pending = PendingWait {
            bridge_session_id: bridge_session_id.clone(),
            message: message.clone(),
            prompt: prompt.clone(),
            title: title.clone(),
            enqueued_at: now,
            response_tx: tx,
        };

        let assistant_msg = CursorMcpMessage {
            id: format!("msg-{}", Uuid::new_v4()),
            vk_session_id: routed_vk,
            bridge_session_id: bridge_session_id.clone(),
            role: CursorMcpRole::Assistant,
            body: message.clone(),
            created_at: now,
        };

        let info = CursorMcpWaitInfo {
            request_id: request_id.clone(),
            vk_session_id: routed_vk,
            bridge_session_id: bridge_session_id.clone(),
            message: message.clone(),
            prompt: prompt.clone(),
            enqueued_at: now,
            renew_deadline_at: now
                + chrono::Duration::from_std(FORCE_RENEW_INTERVAL)
                    .unwrap_or(chrono::Duration::seconds(60)),
        };

        // Append to the appropriate conversation state.
        match routed_vk {
            Some(vk_id) => {
                self.append_message_internal_vk(vk_id, assistant_msg).await;
                let state_arc = self.ensure_vk_session_state(vk_id);
                let mut state = state_arc.lock().await;
                state.queue.push_back(request_id.clone());
                let _ = state.patches_tx.send(CursorMcpPatch::WaitEnqueued(info));
            }
            None => {
                // Persist / refresh lobby DB row.
                if let Err(e) = CursorMcpLobbySession::upsert_first_seen(
                    &self.db.pool,
                    &bridge_session_id,
                    bridge_label.as_deref(),
                    title.as_deref(),
                    &message,
                )
                .await
                {
                    tracing::warn!("enqueue_wait: lobby upsert failed: {}", e);
                }
                self.append_message_internal_lobby(&bridge_session_id, assistant_msg)
                    .await;
                let state_arc = self.ensure_lobby_session_state(&bridge_session_id);
                let mut state = state_arc.lock().await;
                state.queue.push_back(request_id.clone());
                let _ = state.patches_tx.send(CursorMcpPatch::WaitEnqueued(info));

                // Broadcast on the global inbox stream.
                let inbox_item = self.lobby_item_for(&bridge_session_id, &state).await;
                let _ = self
                    .inbox_patches_tx
                    .send(InboxPatch::SessionUpdated(inbox_item));
            }
        }

        self.pending.insert(request_id.clone(), pending);
        self.spawn_renew_watcher(request_id);

        rx
    }

    /// Frontend → backend: resolve the front pending wait of a vk session
    /// with a user reply. Returns whether anything was resolved.
    pub async fn resolve_with_user_reply(&self, vk_session_id: Uuid, text: String) -> bool {
        // Always heal first so `bridge_session_id` on the mirrored user
        // message is populated even when the vk queue still had a stale
        // `request_id` from before a restart (pop path skips heal).
        let _ = self.heal_bridge_mapping_for_vk(vk_session_id).await;
        let now = Utc::now();
        let request_id = self.pop_next_resolve_request_id(vk_session_id).await;

        let bridge_id = self
            .bridge_session_for_vk(vk_session_id)
            .unwrap_or_default();

        let user_msg = CursorMcpMessage {
            id: format!("msg-{}", Uuid::new_v4()),
            vk_session_id: Some(vk_session_id),
            bridge_session_id: bridge_id.clone(),
            role: CursorMcpRole::User,
            body: text.clone(),
            created_at: now,
        };

        let Some(request_id) = request_id else {
            self.append_message_internal_vk(vk_session_id, user_msg)
                .await;
            return false;
        };
        let Some((_, pending)) = self.pending.remove(&request_id) else {
            return false;
        };
        self.pending_bridges.remove(&request_id);

        self.append_message_internal_vk(vk_session_id, user_msg)
            .await;
        {
            let state_arc = self.ensure_vk_session_state(vk_session_id);
            let state = state_arc.lock().await;
            let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                request_id: request_id.clone(),
            });
        }
        let _ = pending.response_tx.send(text);
        true
    }

    pub async fn cancel_wait(&self, vk_session_id: Uuid, request_id: &str) -> bool {
        let removed_in_queue = {
            let state_arc = self.ensure_vk_session_state(vk_session_id);
            let mut state = state_arc.lock().await;
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
            self.pending_bridges.remove(request_id);
            let _ = pending.response_tx.send(USER_DISMISSED_QUEUE.to_string());
            true
        } else {
            removed_in_queue
        }
    }

    // ---- internal helpers ------------------------------------------------

    async fn append_message_internal_vk(&self, vk_session_id: Uuid, msg: CursorMcpMessage) {
        let state_arc = self.ensure_vk_session_state(vk_session_id);
        let mut state = state_arc.lock().await;
        state.messages.push_back(msg.clone());
        while state.messages.len() > MAX_MESSAGES_PER_SESSION {
            state.messages.pop_front();
        }
        let _ = state.patches_tx.send(CursorMcpPatch::MessageAppended(msg));
    }

    async fn append_message_internal_lobby(&self, bridge_session_id: &str, msg: CursorMcpMessage) {
        let state_arc = self.ensure_lobby_session_state(bridge_session_id);
        let mut state = state_arc.lock().await;
        state.messages.push_back(msg.clone());
        while state.messages.len() > MAX_MESSAGES_PER_SESSION {
            state.messages.pop_front();
        }
        let _ = state.patches_tx.send(CursorMcpPatch::MessageAppended(msg));
    }

    async fn lobby_item_for(
        &self,
        bridge_session_id: &str,
        state: &ConversationState,
    ) -> InboxLobbyItem {
        let row = CursorMcpLobbySession::find(&self.db.pool, bridge_session_id)
            .await
            .ok()
            .flatten();
        InboxLobbyItem {
            bridge_session_id: bridge_session_id.to_string(),
            bridge_label: row.as_ref().and_then(|r| r.bridge_label.clone()),
            title: row.as_ref().and_then(|r| r.title.clone()),
            first_message: row.as_ref().and_then(|r| r.first_message.clone()),
            last_activity_at: row.map(|r| r.last_activity_at).unwrap_or_else(Utc::now),
            pending_count: state.queue.len(),
        }
    }

    fn spawn_renew_watcher(&self, request_id: String) {
        let pending = self.pending.clone();
        let pending_bridges = self.pending_bridges.clone();
        let lobby_state = self.lobby_state.clone();
        let vk_session_state = self.vk_session_state.clone();
        let bridge_to_vk = self.bridge_to_vk.clone();
        let inbox_tx = self.inbox_patches_tx.clone();
        let svc_db = self.db.clone();
        tokio::spawn(async move {
            tokio::time::sleep(FORCE_RENEW_INTERVAL).await;
            let Some((_, pending_wait)) = pending.remove(&request_id) else {
                return;
            };
            pending_bridges.remove(&request_id);
            let bsid = pending_wait.bridge_session_id.clone();
            // Drop from per-conversation queue.
            if let Some(vk_id) = bridge_to_vk.get(&bsid).map(|v| *v) {
                if let Some(state_arc) = vk_session_state.get(&vk_id) {
                    let mut state = state_arc.lock().await;
                    if let Some(pos) = state.queue.iter().position(|id| id == &request_id) {
                        state.queue.remove(pos);
                    }
                    let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                        request_id: request_id.clone(),
                    });
                }
            } else if let Some(state_arc) = lobby_state.get(&bsid) {
                let mut state = state_arc.lock().await;
                if let Some(pos) = state.queue.iter().position(|id| id == &request_id) {
                    state.queue.remove(pos);
                }
                let _ = state.patches_tx.send(CursorMcpPatch::WaitResolved {
                    request_id: request_id.clone(),
                });

                // Broadcast a fresh inbox patch reflecting the lower
                // pending_count. After a renew the DB row's
                // `last_activity_at` is already older than
                // `FRESH_LOBBY_WINDOW`, so once the queue drains the
                // picker should drop the entry rather than show it with
                // a "0 waiting" badge.
                let item = {
                    let row = CursorMcpLobbySession::find(&svc_db.pool, &bsid)
                        .await
                        .ok()
                        .flatten();
                    InboxLobbyItem {
                        bridge_session_id: bsid.clone(),
                        bridge_label: row.as_ref().and_then(|r| r.bridge_label.clone()),
                        title: row.as_ref().and_then(|r| r.title.clone()),
                        first_message: row.as_ref().and_then(|r| r.first_message.clone()),
                        last_activity_at: row.map(|r| r.last_activity_at).unwrap_or_else(Utc::now),
                        pending_count: state.queue.len(),
                    }
                };
                if CursorMcpService::is_fresh_lobby_item(&item, Utc::now()) {
                    let _ = inbox_tx.send(InboxPatch::SessionUpdated(item));
                } else {
                    let _ = inbox_tx.send(InboxPatch::SessionRemoved {
                        bridge_session_id: bsid.clone(),
                    });
                }
            }
            let _ = pending_wait.response_tx.send(TIMEOUT_RENEW.to_string());
        });
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    async fn fresh_service() -> CursorMcpService {
        // Isolated per-test `:memory:` sqlite — see
        // `DBService::new_in_memory()` for why this matters (the
        // production `DBService::new()` uses a shared on-disk file and
        // would leak rows between tests).
        let db = DBService::new_in_memory()
            .await
            .expect("create in-memory test db");
        let svc = CursorMcpService::new(db);
        svc.rehydrate_adopted().await.expect("rehydrate empty db");
        svc
    }

    #[tokio::test]
    async fn enqueue_in_lobby_then_adopt_routes_subsequent_waits() {
        let svc = fresh_service().await;

        let bridge_session_id = "ab12-cd34".to_string();
        let rx1 = svc
            .enqueue_wait(
                bridge_session_id.clone(),
                Some("test-host".into()),
                "req-1".into(),
                "first hello".into(),
                None,
                Some("first turn".into()),
            )
            .await;
        // Adopt into a freshly-minted vk session.
        let vk = Uuid::new_v4();
        let adopted = svc
            .adopt_lobby_session(&bridge_session_id, vk)
            .await
            .expect("adopt");
        assert_eq!(adopted.migrated_messages.len(), 1);
        assert_eq!(adopted.migrated_messages[0].body, "first hello");
        assert_eq!(adopted.migrated_messages[0].role, CursorMcpRole::Assistant);
        // Resolve the migrated wait.
        let resolved = svc.resolve_with_user_reply(vk, "ok".into()).await;
        assert!(resolved);
        let reply = tokio::time::timeout(StdDuration::from_secs(1), rx1)
            .await
            .expect("must resolve")
            .expect("not cancelled");
        assert_eq!(reply, "ok");

        // Subsequent wait with the same bridge_session_id routes
        // directly to the vk session.
        let rx2 = svc
            .enqueue_wait(
                bridge_session_id.clone(),
                None,
                "req-2".into(),
                "second turn".into(),
                None,
                None,
            )
            .await;
        let resolved2 = svc.resolve_with_user_reply(vk, "ok2".into()).await;
        assert!(resolved2);
        let reply2 = tokio::time::timeout(StdDuration::from_secs(1), rx2)
            .await
            .expect("must resolve")
            .expect("not cancelled");
        assert_eq!(reply2, "ok2");
    }

    #[tokio::test]
    async fn delete_lobby_session_dismisses_pending() {
        let svc = fresh_service().await;
        let bsid = "dl-test".to_string();
        let rx = svc
            .enqueue_wait(
                bsid.clone(),
                None,
                "req".into(),
                "are you there?".into(),
                None,
                None,
            )
            .await;
        svc.delete_lobby_session(&bsid).await.expect("delete");
        let reply = tokio::time::timeout(StdDuration::from_secs(1), rx)
            .await
            .expect("must resolve")
            .expect("not cancelled");
        assert_eq!(reply, USER_DISMISSED_QUEUE);
    }

    #[tokio::test]
    async fn register_unregister_bridge_updates_count() {
        let svc = fresh_service().await;
        let (handle, _rx) = svc.register_bridge().await;
        assert_eq!(svc.bridge_count().await, 1);
        svc.unregister_bridge(&handle).await;
        assert_eq!(svc.bridge_count().await, 0);
    }

    #[tokio::test]
    async fn inbox_snapshot_lists_lobby_and_bridges() {
        let svc = fresh_service().await;
        let (_h, _rx) = svc.register_bridge().await;
        let _ = svc
            .enqueue_wait(
                "snap-A".into(),
                Some("host-a".into()),
                "r1".into(),
                "hello A".into(),
                None,
                None,
            )
            .await;
        let _ = svc
            .enqueue_wait(
                "snap-B".into(),
                Some("host-b".into()),
                "r2".into(),
                "hello B".into(),
                None,
                None,
            )
            .await;
        let snap = svc.inbox_snapshot().await;
        assert_eq!(snap.bridges.len(), 1);
        assert_eq!(snap.lobby.len(), 2);
    }

    /// Backdate a lobby row's `last_activity_at` by the given seconds so
    /// the freshness filter can be exercised without a real clock wait.
    async fn backdate_last_activity(
        pool: &sqlx::SqlitePool,
        bridge_session_id: &str,
        seconds_ago: i64,
    ) {
        sqlx::query(
            "UPDATE cursor_mcp_lobby_sessions
                 SET last_activity_at = datetime('now', ?1)
                 WHERE bridge_session_id = ?2",
        )
        .bind(format!("-{} seconds", seconds_ago))
        .bind(bridge_session_id)
        .execute(pool)
        .await
        .expect("backdate");
    }

    #[tokio::test]
    async fn inbox_snapshot_hides_stale_lobby_with_no_pending_waits() {
        let svc = fresh_service().await;

        // Stale entry: enqueue then drain the pending wait so the queue
        // is empty, then backdate last_activity far past the freshness
        // window.
        let rx_stale = svc
            .enqueue_wait(
                "stale-entry".into(),
                Some("host-stale".into()),
                "r-stale".into(),
                "message".into(),
                None,
                None,
            )
            .await;
        let vk_for_cleanup = Uuid::new_v4();
        svc.adopt_lobby_session("stale-entry", vk_for_cleanup)
            .await
            .expect("adopt stale so its pending wait is migrated off the lobby");
        // Re-insert a fresh lobby row for the same id so it's visible to
        // the filter logic, then backdate its activity. We need to first
        // break the adopted mapping in-memory + DB so upsert_first_seen
        // treats it as a new unadopted row.
        svc.bridge_to_vk.remove("stale-entry");
        svc.vk_to_bridge.remove(&vk_for_cleanup);
        sqlx::query("DELETE FROM cursor_mcp_lobby_sessions WHERE bridge_session_id = ?")
            .bind("stale-entry")
            .execute(&svc.db.pool)
            .await
            .expect("reset stale entry row");
        CursorMcpLobbySession::upsert_first_seen(
            &svc.db.pool,
            "stale-entry",
            Some("host-stale"),
            None,
            "old assistant msg",
        )
        .await
        .expect("re-insert stale row");
        // Drop migrated state so pending_count observes empty.
        svc.vk_session_state.remove(&vk_for_cleanup);
        svc.lobby_state.remove("stale-entry");
        backdate_last_activity(
            &svc.db.pool,
            "stale-entry",
            (FRESH_LOBBY_WINDOW.as_secs() as i64) + 60,
        )
        .await;
        // Resolve the originally-returned oneshot so the test doesn't
        // leave a dangling receiver. Any outcome works.
        drop(rx_stale);

        // Fresh entry with a pending wait: visible regardless of age.
        let _rx_fresh = svc
            .enqueue_wait(
                "fresh-entry".into(),
                Some("host-fresh".into()),
                "r-fresh".into(),
                "message".into(),
                None,
                None,
            )
            .await;

        let snap = svc.inbox_snapshot().await;
        let ids: Vec<_> = snap
            .lobby
            .iter()
            .map(|it| it.bridge_session_id.clone())
            .collect();
        assert!(ids.contains(&"fresh-entry".to_string()));
        assert!(
            !ids.contains(&"stale-entry".to_string()),
            "stale lobby entry with no pending wait must be filtered out, got {:?}",
            ids
        );
    }

    #[tokio::test]
    async fn lobby_gc_broadcasts_session_removed_for_newly_stale_entries() {
        let svc = fresh_service().await;
        let mut inbox_rx = svc.inbox_patches_tx.subscribe();

        // Seed a freshly-active lobby row, then drop its pending wait so
        // the queue is empty; keep the DB row as unadopted.
        let rx = svc
            .enqueue_wait(
                "gc-entry".into(),
                Some("host".into()),
                "req".into(),
                "msg".into(),
                None,
                None,
            )
            .await;
        // Consume the SessionUpdated emitted by enqueue_wait so the
        // assertion below only sees the GC's SessionRemoved.
        let _ = inbox_rx.try_recv();
        drop(rx);
        svc.lobby_state.remove("gc-entry");

        // Capture baseline of fresh ids (`gc-entry` is fresh because the
        // row's last_activity_at is now, even though the queue is empty).
        let baseline = svc.current_fresh_lobby_ids().await.expect("baseline");
        assert!(baseline.contains("gc-entry"));

        // Push the row's last_activity_at past the window so the next
        // sweep treats it as stale.
        backdate_last_activity(
            &svc.db.pool,
            "gc-entry",
            (FRESH_LOBBY_WINDOW.as_secs() as i64) + 5,
        )
        .await;

        let after = svc.sweep_stale_lobby_entries(&baseline).await;
        assert!(!after.contains("gc-entry"));

        // The GC must have emitted a SessionRemoved for the newly-stale
        // entry — drain a single patch and check it matches.
        let patch = tokio::time::timeout(StdDuration::from_millis(100), inbox_rx.recv())
            .await
            .expect("GC must emit SessionRemoved before the test timeout")
            .expect("inbox channel must be open");
        match patch {
            InboxPatch::SessionRemoved { bridge_session_id } => {
                assert_eq!(bridge_session_id, "gc-entry");
            }
            other => panic!("expected SessionRemoved, got {:?}", other),
        }
    }

    #[test]
    fn is_fresh_lobby_item_respects_window_and_pending() {
        let now = Utc::now();
        let old = now - chrono::Duration::seconds(FRESH_LOBBY_WINDOW.as_secs() as i64 + 1);
        let recent = now - chrono::Duration::seconds(10);

        let mut item = InboxLobbyItem {
            bridge_session_id: "x".into(),
            bridge_label: None,
            title: None,
            first_message: None,
            last_activity_at: old,
            pending_count: 0,
        };
        assert!(!CursorMcpService::is_fresh_lobby_item(&item, now));

        item.pending_count = 1;
        assert!(
            CursorMcpService::is_fresh_lobby_item(&item, now),
            "pending_count>0 must keep an item fresh regardless of age"
        );

        item.pending_count = 0;
        item.last_activity_at = recent;
        assert!(CursorMcpService::is_fresh_lobby_item(&item, now));
    }

    #[tokio::test]
    async fn session_snapshot_is_read_only_for_unknown_sessions() {
        let svc = fresh_service().await;
        let unknown = Uuid::new_v4();

        let snap = svc.session_snapshot(unknown).await;
        assert!(snap.messages.is_empty());
        assert!(snap.pending_waits.is_empty());
        // Critically: no DashMap entry should have been allocated. If we
        // accidentally re-add the auto-create behavior this assertion
        // fails loudly.
        assert!(
            svc.vk_session_state.get(&unknown).is_none(),
            "session_snapshot must not allocate state for unknown sessions",
        );
    }

    #[tokio::test]
    async fn forget_vk_session_drops_state_and_routing() {
        let svc = fresh_service().await;
        let vk = Uuid::new_v4();
        let bsid = "forget-test".to_string();

        // Plant an adopted mapping + vk session state.
        svc.bridge_to_vk.insert(bsid.clone(), vk);
        svc.vk_to_bridge.insert(vk, bsid.clone());
        svc.ensure_vk_session_state(vk);
        assert!(svc.vk_session_state.get(&vk).is_some());
        assert_eq!(
            svc.bridge_session_for_vk(vk).as_deref(),
            Some(bsid.as_str())
        );

        svc.forget_vk_session(vk);
        assert!(svc.vk_session_state.get(&vk).is_none());
        assert!(svc.bridge_session_for_vk(vk).is_none());
        assert!(svc.resolve_bridge_session(&bsid).is_none());
    }
}
