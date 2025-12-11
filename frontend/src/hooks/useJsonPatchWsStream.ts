import { useEffect, useState, useRef } from 'react';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsFinishedMsg = { finished: boolean };
type WsRefreshRequiredMsg = { refresh_required: { reason: string } };
type WsMsg = WsJsonPatchMsg | WsFinishedMsg | WsRefreshRequiredMsg;

// Keep-alive constants
// Server sends pings every 15s for execution streams, 30s for list streams.
// If we receive no messages (including pong responses to server pings) for 30s,
// the connection is likely dead and should be reconnected.
const PING_INTERVAL_MS = 25000; // Check connection status every 25 seconds
const STALE_THRESHOLD_MS = 30000; // Force reconnect if no messages for 30 seconds
const MAX_RECONNECT_ATTEMPTS = 10; // Give up after 10 failed reconnection attempts

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
  const lastMessageTimeRef = useRef<number>(Date.now());
  const connectingRef = useRef<boolean>(false); // Guard against race conditions

  const injectInitialEntry = options?.injectInitialEntry;
  const deduplicatePatches = options?.deduplicatePatches;
  const onRefreshRequired = options?.onRefreshRequired;

  // Record message time - used for debugging keep-alive status
  function recordMessageTime() {
    lastMessageTimeRef.current = Date.now();
  }

  // Clear all keep-alive timers
  function clearKeepAliveTimers() {
    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }

  function scheduleReconnect() {
    if (retryTimerRef.current) return; // already scheduled

    // Check if we've exceeded max reconnection attempts
    if (retryAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        '[WS] Max reconnection attempts exceeded, giving up. Refresh the page to retry.'
      );
      setError('Connection failed after multiple retries. Please refresh the page.');
      return;
    }

    // Exponential backoff with cap: 1s, 2s, 4s, 8s (max), then stay at 8s
    // Add jitter (0-25%) to prevent thundering herd when multiple connections reconnect
    const attempt = retryAttemptsRef.current;
    const baseDelay = Math.min(8000, 1000 * Math.pow(2, attempt));
    const jitter = baseDelay * 0.25 * Math.random();
    const delay = baseDelay + jitter;

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

    // Create WebSocket if it doesn't exist and we're not already connecting
    // The connectingRef guard prevents race conditions where useEffect fires
    // multiple times before wsRef.current is set
    if (!wsRef.current && !connectingRef.current) {
      // Set guard immediately to prevent concurrent connection attempts
      connectingRef.current = true;

      // Reset finished flag for new connection
      finishedRef.current = false;

      // Convert HTTP endpoint to WebSocket endpoint
      const wsEndpoint = endpoint.replace(/^http/, 'ws');
      const ws = new WebSocket(wsEndpoint);

      // Set wsRef immediately after creation to prevent duplicates
      wsRef.current = ws;

      ws.onopen = () => {
        // Clear connecting guard - connection established
        connectingRef.current = false;

        setError(null);
        setIsConnected(true);
        // Reset backoff on successful connection
        retryAttemptsRef.current = 0;
        if (retryTimerRef.current) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }

        // Record initial connection time
        recordMessageTime();

        // Start stale connection detection interval
        // Server sends pings every 15-30s depending on stream type.
        // If we receive no messages for STALE_THRESHOLD_MS, force reconnection.
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const idleTime = Date.now() - lastMessageTimeRef.current;
            if (idleTime > STALE_THRESHOLD_MS) {
              // Connection is stale - force reconnection
              console.warn(
                '[WS] Connection stale after',
                Math.round(idleTime / 1000),
                's, reconnecting...'
              );
              // Close with custom code to indicate stale connection
              // onclose handler will trigger scheduleReconnect()
              ws.close(4000, 'stale connection');
            } else if (idleTime > PING_INTERVAL_MS * 2) {
              // Warning: approaching stale threshold
              console.debug('[WS] No message for', Math.round(idleTime / 1000), 's');
            }
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        // Record message time for debugging keep-alive status
        recordMessageTime();

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
        // Clear connecting guard on error
        connectingRef.current = false;
        setError('Connection failed');
      };

      ws.onclose = (evt) => {
        // Clear connecting guard and reference BEFORE scheduling reconnect
        // This ensures the next connection attempt isn't blocked
        connectingRef.current = false;
        wsRef.current = null;

        setIsConnected(false);
        clearKeepAliveTimers();

        // Do not reconnect if we received a finished message or clean close
        if (finishedRef.current || (evt?.code === 1000 && evt?.wasClean)) {
          return;
        }

        // For stale connection recovery (code 4000), reconnect immediately without incrementing retry
        // This is proactive recovery, not a failure
        if (evt?.code === 4000) {
          scheduleReconnect();
          return;
        }

        // For actual failures, increment retry count
        retryAttemptsRef.current += 1;
        scheduleReconnect();
      };
    }

    return () => {
      // Clear connecting guard on cleanup
      connectingRef.current = false;

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
