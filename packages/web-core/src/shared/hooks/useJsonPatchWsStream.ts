import { useEffect, useRef, useState } from 'react';
import { produce } from 'immer';
import type { Operation } from 'rfc6902';
import { applyUpsertPatch } from '@/shared/lib/jsonPatch';
import { openLocalApiWebSocket } from '@/shared/lib/localApiTransport';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsReadyMsg = { Ready: true };
type WsFinishedMsg = { finished: boolean };
type WsMsg = WsJsonPatchMsg | WsReadyMsg | WsFinishedMsg;

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
   * Long-lived state streams should reconnect after a normal close so they can
   * refresh from the next initial snapshot instead of leaving stale UI state.
   */
  reconnectOnCleanClose?: boolean;
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  isInitialized: boolean;
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
  const [isInitialized, setIsInitialized] = useState(false);
  const initializedForEndpointRef = useRef<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataRef = useRef<T | undefined>(undefined);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptsRef = useRef<number>(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const finishedRef = useRef<boolean>(false);

  const injectInitialEntry = options?.injectInitialEntry;
  const deduplicatePatches = options?.deduplicatePatches;
  const reconnectOnCleanClose = options?.reconnectOnCleanClose ?? false;

  useEffect(() => {
    if (!enabled || !endpoint) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryAttemptsRef.current = 0;
      finishedRef.current = false;
      initializedForEndpointRef.current = undefined;
      setData(undefined);
      setIsConnected(false);
      setIsInitialized(false);
      setError(null);
      dataRef.current = undefined;
      return;
    }

    dataRef.current = undefined;
    setData(undefined);
    setIsConnected(false);
    setIsInitialized(false);
    setError(null);
    retryAttemptsRef.current = 0;
    finishedRef.current = false;
  }, [enabled, endpoint]);

  function scheduleReconnect() {
    if (retryTimerRef.current) return;
    const attempt = retryAttemptsRef.current;
    const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetryNonce((n) => n + 1);
    }, delay);
  }

  useEffect(() => {
    if (!enabled || !endpoint) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    if (!dataRef.current) {
      dataRef.current = initialData();
      if (injectInitialEntry) {
        injectInitialEntry(dataRef.current);
      }
    }

    let cancelled = false;

    if (!wsRef.current) {
      finishedRef.current = false;

      void (async () => {
        try {
          const ws = await openLocalApiWebSocket(endpoint);

          if (cancelled) {
            ws.close();
            return;
          }

          ws.onopen = () => {
            setError(null);
            setIsConnected(true);
            retryAttemptsRef.current = 0;
            if (retryTimerRef.current) {
              window.clearTimeout(retryTimerRef.current);
              retryTimerRef.current = null;
            }
          };

          ws.onmessage = (event) => {
            try {
              const msg: WsMsg = JSON.parse(event.data);

              if ('JsonPatch' in msg) {
                const patches: Operation[] = msg.JsonPatch;
                const filtered = deduplicatePatches
                  ? deduplicatePatches(patches)
                  : patches;

                const current = dataRef.current;
                if (!filtered.length || !current) return;

                const next = produce(current, (draft) => {
                  applyUpsertPatch(draft, filtered);
                });

                dataRef.current = next;
                setData(next);
              }

              if ('Ready' in msg) {
                initializedForEndpointRef.current = endpoint;
                setIsInitialized(true);
                setError(null);
              }

              if ('finished' in msg) {
                finishedRef.current = true;
                ws.close(1000, 'finished');
                wsRef.current = null;
                setIsConnected(false);
                if (reconnectOnCleanClose) {
                  scheduleReconnect();
                }
              }
            } catch (err) {
              console.error('Failed to process WebSocket message:', err);
              setError('Failed to process stream update');
            }
          };

          ws.onerror = () => {
            // Let onclose drive reconnect logic.
          };

          ws.onclose = () => {
            setIsConnected(false);
            wsRef.current = null;

            // Only an explicit finished message is terminal for these streams.
            // A clean close without finished still needs reconnect so mounted
            // UI stays current through restarts and transient transport churn.
            if (cancelled || (finishedRef.current && !reconnectOnCleanClose)) {
              return;
            }

            retryAttemptsRef.current += 1;
            if (!dataRef.current && retryAttemptsRef.current > 6) {
              setError('Connection failed');
            }
            scheduleReconnect();
          };

          wsRef.current = ws;
        } catch (openError) {
          if (cancelled) {
            return;
          }

          console.error('Failed to open WebSocket stream:', openError);
          retryAttemptsRef.current += 1;
          scheduleReconnect();
        }
      })();
    }

    return () => {
      cancelled = true;
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        wsRef.current = null;
      }
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [
    endpoint,
    enabled,
    initialData,
    injectInitialEntry,
    deduplicatePatches,
    reconnectOnCleanClose,
    retryNonce,
  ]);

  const isInitializedForCurrentEndpoint =
    isInitialized && initializedForEndpointRef.current === endpoint;

  return {
    data,
    isConnected,
    isInitialized: isInitializedForCurrentEndpoint,
    error,
  };
};
