import { useEffect, useState, useRef } from 'react';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsFinishedMsg = { finished: boolean };
type WsRefreshRequiredMsg = { refresh_required: { reason: string } };
type WsMsg = WsJsonPatchMsg | WsFinishedMsg | WsRefreshRequiredMsg;

// Keep-alive constants
const PING_INTERVAL_MS = 25000; // Send ping every 25 seconds
const IDLE_TIMEOUT_MS = 60000; // Consider connection stale after 60s of no messages

interface UseJsonPatchStreamOptions<T> {
  /**
   * Called once when the stream starts to inject initial data
   */
  injectInitialEntry?: (data: T) => void;
  /**
   * Filter/deduplicate patches before applying them
   */
  deduplicatePatches?: (patches: Operation[]) => Operation[];
  /**
   * Called when server signals that the client should refresh data.
   * This happens when the server's broadcast channel lagged and missed messages.
   * If not provided, the hook will automatically reconnect.
   */
  onRefreshRequired?: (reason: string) => void;
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  error: string | null;
}

/**
 * Generic hook for consuming WebSocket streams that send JSON messages with patches
 */
export const useJsonPatchWsStream = <T extends object>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options?: UseJsonPatchStreamOptions<T>
): UseJsonPatchStreamResult<T> => {
  const [data, setData] = useState<T | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<T | undefined>(undefined);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef<number>(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const finishedRef = useRef<boolean>(false);
  const pingIntervalRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const lastMessageTimeRef = useRef<number>(Date.now());

  const injectInitialEntry = options?.injectInitialEntry;
  const deduplicatePatches = options?.deduplicatePatches;
  const onRefreshRequired = options?.onRefreshRequired;

  // Reset the idle timeout - called on every message received
  function resetIdleTimeout() {
    lastMessageTimeRef.current = Date.now();
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = window.setTimeout(() => {
      console.warn(
        '[WS] Connection appears stale - no messages for',
        IDLE_TIMEOUT_MS / 1000,
        's'
      );
      // Force reconnect by closing the socket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(4000, 'idle timeout');
      }
    }, IDLE_TIMEOUT_MS);
  }

  // Clear all keep-alive timers
  function clearKeepAliveTimers() {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }

  function scheduleReconnect() {
    if (retryTimerRef.current) return; // already scheduled
    // Exponential backoff with cap: 1s, 2s, 4s, 8s (max), then stay at 8s
    const attempt = retryAttemptsRef.current;
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetryNonce((n) => n + 1);
    }, delay);
  }

  useEffect(() => {
    if (!enabled || !endpoint) {
      // Close connection and reset state
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      clearKeepAliveTimers();
      retryAttemptsRef.current = 0;
      finishedRef.current = false;
      setData(undefined);
      setIsConnected(false);
      setError(null);
      dataRef.current = undefined;
      return;
    }

    // Initialize data
    if (!dataRef.current) {
      dataRef.current = initialData();

      // Inject initial entry if provided
      if (injectInitialEntry) {
        injectInitialEntry(dataRef.current);
      }
    }

    // Create WebSocket if it doesn't exist
    if (!wsRef.current) {
      // Reset finished flag for new connection
      finishedRef.current = false;

      // Convert HTTP endpoint to WebSocket endpoint
      const wsEndpoint = endpoint.replace(/^http/, 'ws');
      const ws = new WebSocket(wsEndpoint);

      ws.onopen = () => {
        setError(null);
        setIsConnected(true);
        // Reset backoff on successful connection
        retryAttemptsRef.current = 0;
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }

        // Start keep-alive mechanisms
        // 1. Client-side ping interval - WebSocket ping frames
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            // Send a ping frame (empty binary message acts as heartbeat)
            // Note: Browser WebSocket API doesn't expose ping frames directly,
            // but the server is sending pings and we respond with pongs automatically.
            // This interval is mainly to log keep-alive status.
            const idleTime = Date.now() - lastMessageTimeRef.current;
            if (idleTime > PING_INTERVAL_MS) {
              console.debug('[WS] No message for', Math.round(idleTime / 1000), 's');
            }
          }
        }, PING_INTERVAL_MS);

        // 2. Start idle timeout
        resetIdleTimeout();
      };

      ws.onmessage = (event) => {
        // Reset idle timeout on any message (including pong responses)
        resetIdleTimeout();

        try {
          const msg: WsMsg = JSON.parse(event.data);

          // Handle JsonPatch messages (same as SSE json_patch event)
          if ('JsonPatch' in msg) {
            const patches: Operation[] = msg.JsonPatch;
            const filtered = deduplicatePatches
              ? deduplicatePatches(patches)
              : patches;

            const current = dataRef.current;
            if (!filtered.length || !current) return;

            // Deep clone the current state before mutating it
            const next = structuredClone(current);

            // Apply patch (mutates the clone in place)
            applyPatch(next, filtered);

            dataRef.current = next;
            setData(next);
          }

          // Handle refresh_required messages - server missed broadcasts
          if ('refresh_required' in msg) {
            const reason = msg.refresh_required.reason;
            console.warn('[WS] Server signaled refresh required:', reason);

            if (onRefreshRequired) {
              // Let caller handle refresh (e.g., refetch data)
              onRefreshRequired(reason);
            } else {
              // Default behavior: reset data and reconnect to get fresh state
              dataRef.current = undefined;
              ws.close(4001, 'refresh required');
            }
            return;
          }

          // Handle finished messages ({finished: true})
          // Treat finished as terminal - do NOT reconnect
          if ('finished' in msg) {
            finishedRef.current = true;
            clearKeepAliveTimers();
            ws.close(1000, 'finished');
            wsRef.current = null;
            setIsConnected(false);
          }
        } catch (err) {
          console.error('Failed to process WebSocket message:', err);
          setError('Failed to process stream update');
        }
      };

      ws.onerror = () => {
        setError('Connection failed');
      };

      ws.onclose = (evt) => {
        setIsConnected(false);
        wsRef.current = null;
        clearKeepAliveTimers();

        // Do not reconnect if we received a finished message or clean close
        if (finishedRef.current || (evt?.code === 1000 && evt?.wasClean)) {
          return;
        }

        // Otherwise, reconnect on unexpected/error closures
        retryAttemptsRef.current += 1;
        scheduleReconnect();
      };

      wsRef.current = ws;
    }

    return () => {
      if (wsRef.current) {
        const ws = wsRef.current;

        // Clear all event handlers first to prevent callbacks after cleanup
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;

        // Close regardless of state
        ws.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      clearKeepAliveTimers();
      finishedRef.current = false;
      dataRef.current = undefined;
      setData(undefined);
    };
  }, [
    endpoint,
    enabled,
    initialData,
    injectInitialEntry,
    deduplicatePatches,
    onRefreshRequired,
    retryNonce,
  ]);

  return { data, isConnected, error };
};
