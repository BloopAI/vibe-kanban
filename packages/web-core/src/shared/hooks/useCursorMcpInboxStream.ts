import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  type InboxBridgeInfo,
  type InboxLobbyItem,
  type InboxPatch,
  type InboxSnapshot,
} from 'shared/types';
import { cursorMcpApi } from '@/shared/lib/api';

export type CursorMcpInboxState = {
  /** Connected Cursor MCP bridge processes (workspace-agnostic in v4). */
  bridges: InboxBridgeInfo[];
  /** Conversations that haven't been adopted into a vk workspace yet. */
  lobby: InboxLobbyItem[];
  /** `true` while the initial REST snapshot is loading. */
  isLoading: boolean;
  /** Last error from the WebSocket / REST fallback (if any). */
  error: string | null;
  /** `true` while the WebSocket is open. */
  wsConnected: boolean;
};

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------
//
// Every component that calls `useCursorMcpInboxStream()` subscribes to the
// same underlying WebSocket. A refcount starts/stops the connection so we
// never hold a WS open when the UI doesn't need it. This replaces an
// earlier per-hook-instance WS which opened one connection per mount point
// (banner + create page = 2 WS at once).

const RECONNECT_BACKOFF_START_MS = 500;
const RECONNECT_BACKOFF_MAX_MS = 15_000;

let subscriberCount = 0;
let currentSnapshot: InboxSnapshot | null = null;
let currentError: string | null = null;
let wsOpen = false;
let ws: WebSocket | null = null;
let reconnectBackoff = RECONNECT_BACKOFF_START_MS;
let reconnectTimer: number | null = null;
let stopped = false;

// Stable reference identity is important so React's `useSyncExternalStore`
// bail-out works — we publish a frozen snapshot whenever state changes.
let publishedState: CursorMcpInboxState = deriveState(null, null, false);
const listeners = new Set<() => void>();

function deriveState(
  snapshot: InboxSnapshot | null,
  error: string | null,
  wsConnected: boolean
): CursorMcpInboxState {
  const lobby = snapshot
    ? [...snapshot.lobby].sort((a, b) => {
        const ta = a.last_activity_at
          ? new Date(a.last_activity_at).getTime()
          : 0;
        const tb = b.last_activity_at
          ? new Date(b.last_activity_at).getTime()
          : 0;
        return tb - ta;
      })
    : [];
  return {
    bridges: snapshot?.bridges ?? [],
    lobby,
    isLoading: snapshot == null && error == null,
    error,
    wsConnected,
  };
}

function publish() {
  publishedState = deriveState(currentSnapshot, currentError, wsOpen);
  for (const l of listeners) l();
}

async function fetchRestSnapshot() {
  try {
    const snap = await cursorMcpApi.getInboxState();
    if (stopped) return;
    currentSnapshot = snap;
    currentError = null;
    publish();
  } catch (e) {
    if (stopped) return;
    currentError = e instanceof Error ? e.message : String(e);
    publish();
  }
}

function applyPatch(patch: InboxPatch) {
  const base: InboxSnapshot = currentSnapshot ?? { bridges: [], lobby: [] };
  switch (patch.type) {
    case 'snapshot':
      currentSnapshot = patch.payload;
      break;
    case 'bridges_changed':
      // Patch only carries count — fire a REST refresh to also pick up
      // the new bridges' labels.
      void fetchRestSnapshot();
      return;
    case 'session_updated': {
      const updated = patch.payload;
      const idx = base.lobby.findIndex(
        (it) => it.bridge_session_id === updated.bridge_session_id
      );
      if (idx >= 0) {
        const next = base.lobby.slice();
        next[idx] = updated;
        currentSnapshot = { ...base, lobby: next };
      } else {
        currentSnapshot = { ...base, lobby: [updated, ...base.lobby] };
      }
      break;
    }
    case 'session_adopted':
    case 'session_removed':
      currentSnapshot = {
        ...base,
        lobby: base.lobby.filter(
          (it) => it.bridge_session_id !== patch.payload.bridge_session_id
        ),
      };
      break;
    default:
      return;
  }
  publish();
}

function startConnection() {
  if (stopped) return;
  if (typeof window === 'undefined') return;
  void fetchRestSnapshot();

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${proto}//${window.location.host}/api/cursor-mcp/inbox/stream/ws`;
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch (e) {
    currentError = e instanceof Error ? e.message : String(e);
    publish();
    scheduleReconnect();
    return;
  }
  ws = socket;

  socket.onopen = () => {
    if (stopped) return;
    reconnectBackoff = RECONNECT_BACKOFF_START_MS;
    wsOpen = true;
    currentError = null;
    publish();
  };
  socket.onmessage = (ev) => {
    try {
      const patch = JSON.parse(ev.data) as InboxPatch;
      applyPatch(patch);
    } catch (e) {
      console.warn('[cursor-mcp/inbox] bad patch JSON', e);
    }
  };
  socket.onerror = () => {
    // onclose will fire next with the actual reason.
  };
  socket.onclose = () => {
    ws = null;
    wsOpen = false;
    publish();
    if (stopped) return;
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  if (stopped) return;
  const delay = reconnectBackoff;
  reconnectBackoff = Math.min(reconnectBackoff * 2, RECONNECT_BACKOFF_MAX_MS);
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    startConnection();
  }, delay);
}

function stopConnection() {
  stopped = true;
  if (reconnectTimer != null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
    ws = null;
  }
  wsOpen = false;
  currentSnapshot = null;
  currentError = null;
  // Reset `stopped` after a tick so a re-subscribe cleanly restarts.
  Promise.resolve().then(() => {
    stopped = false;
  });
  publish();
}

function acquire() {
  subscriberCount += 1;
  if (subscriberCount === 1) {
    stopped = false;
    reconnectBackoff = RECONNECT_BACKOFF_START_MS;
    startConnection();
  }
}

function release() {
  subscriberCount -= 1;
  if (subscriberCount === 0) {
    stopConnection();
  }
}

/**
 * Subscribes to the global Cursor MCP **Inbox** stream
 * (`/api/cursor-mcp/inbox/stream/ws`).
 *
 * The underlying WebSocket is a module-level singleton — multiple
 * component mounts share one connection, refcounted via `acquire` /
 * `release`. Reconnects with exponential backoff. Falls back to
 * `/api/cursor-mcp/inbox/state` on mount and on every reconnect so the
 * UI has data even if the WebSocket is unhappy.
 */
export function useCursorMcpInboxStream(): CursorMcpInboxState {
  useEffect(() => {
    acquire();
    return () => release();
  }, []);

  const snap = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => publishedState,
    () => publishedState
  );

  // `publishedState` already has stable identity, but if a consumer
  // wants to downstream-memoize, this is still cheap.
  return useMemo(() => snap, [snap]);
}
