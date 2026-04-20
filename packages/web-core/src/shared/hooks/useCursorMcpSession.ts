import { useEffect, useState } from 'react';
import {
  type CursorMcpPatch,
  type CursorMcpSessionSnapshot,
} from 'shared/types';
import { cursorMcpApi } from '@/shared/lib/api';

/**
 * Live snapshot of a single Cursor MCP vk session: the assistant
 * messages buffered in the in-memory conversation, plus pending
 * `wait_for_user_input` calls. Streams patches over the per-session
 * WebSocket so banner / composer / chat panel can all react without
 * polling.
 *
 * Used by:
 * - `CursorMcpStatusBanner` to render `1 waiting for your reply` etc.
 * - `SessionChatBoxContainer` / `useSessionSend` to decide whether the
 *   send button should resolve a wait via
 *   `cursorMcpApi.resolve(sessionId, …)` instead of going through the
 *   normal `sessionsApi.followUp` path.
 *
 * Returns `snapshot=null` until the initial REST snapshot loads.
 * `isCursorMcp` is `true` once the snapshot reports a non-null
 * `bridge_session_id` — i.e. this vk session has been adopted from a
 * Cursor MCP lobby conversation.
 */
export type CursorMcpSessionState = {
  snapshot: CursorMcpSessionSnapshot | null;
  isCursorMcp: boolean;
  pendingCount: number;
  /** `request_id` of the oldest unresolved wait, or `null` when idle.
   * Used by the chat composer to wire a **Stop** action that dismisses
   * the current wait (sends `__USER_DISMISSED_QUEUE__` back to Cursor).
   * Without this the cursor-mcp UI has no way to interrupt an
   * in-flight wait — the normal "stop execution" path would kill the
   * placeholder process and break the bridge. */
  frontPendingRequestId: string | null;
  fetchError: string | null;
};

export function useCursorMcpSession(
  sessionId: string | undefined
): CursorMcpSessionState {
  const [snapshot, setSnapshot] = useState<CursorMcpSessionSnapshot | null>(
    null
  );
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setSnapshot(null);
      setFetchError(null);
      return;
    }
    let cancelled = false;
    cursorMcpApi
      .getState(sessionId)
      .then((state) => {
        if (!cancelled) {
          setSnapshot(state);
          setFetchError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(err?.message ?? 'failed to load');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    if (typeof window === 'undefined') return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/api/cursor-mcp/sessions/stream/ws?session_id=${sessionId}`;
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const patch = JSON.parse(event.data) as CursorMcpPatch;
        setSnapshot((prev) => {
          if (!prev) {
            return patch.type === 'snapshot' ? patch.payload : prev;
          }
          switch (patch.type) {
            case 'snapshot':
              return patch.payload;
            case 'message_appended':
              return { ...prev, messages: [...prev.messages, patch.payload] };
            case 'wait_enqueued':
              return {
                ...prev,
                pending_waits: [...prev.pending_waits, patch.payload],
              };
            case 'wait_resolved':
              return {
                ...prev,
                pending_waits: prev.pending_waits.filter(
                  (wait) => wait.request_id !== patch.payload.request_id
                ),
              };
            case 'bridge_connected':
              return { ...prev, bridge_connected: patch.payload };
            default:
              return prev;
          }
        });
      } catch (error) {
        console.warn('[cursor-mcp] failed to parse session patch', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  return {
    snapshot,
    isCursorMcp: !!snapshot?.bridge_session_id,
    pendingCount: snapshot?.pending_waits.length ?? 0,
    frontPendingRequestId: snapshot?.pending_waits[0]?.request_id ?? null,
    fetchError,
  };
}
