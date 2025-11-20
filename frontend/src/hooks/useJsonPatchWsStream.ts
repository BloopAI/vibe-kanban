import { useEffect, useState, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';
import { DEFAULT_WEBSOCKET_OPTIONS, toWsUrl } from '@/utils/websocket';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsFinishedMsg = { finished: boolean };
type WsMsg = WsJsonPatchMsg | WsFinishedMsg;

interface UseJsonPatchStreamOptions<T> {
  /**
   * Called once when the stream starts to inject initial data
   */
  injectInitialEntry?: (data: T) => void;
  /**
   * Filter/deduplicate patches before applying them
   */
  deduplicatePatches?: (patches: Operation[]) => Operation[];
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
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<T | undefined>(undefined);
  const finishedRef = useRef<boolean>(false);

  const injectInitialEntry = options?.injectInitialEntry;
  const deduplicatePatches = options?.deduplicatePatches;

  const wsUrl = enabled ? toWsUrl(endpoint) : null;

  useEffect(() => {
    if (!wsUrl) {
      setData(undefined);
      dataRef.current = undefined;
      finishedRef.current = false;
      setError(null);
      return;
    }

    // Initialize data
    if (!dataRef.current) {
      dataRef.current = initialData();

      // Inject initial entry if provided
      if (injectInitialEntry) {
        injectInitialEntry(dataRef.current);
      }
      setData(dataRef.current);
    }
  }, [wsUrl, initialData, injectInitialEntry]);

  const { getWebSocket, readyState } = useWebSocket(wsUrl, {
    ...DEFAULT_WEBSOCKET_OPTIONS,
    shouldReconnect: () => !finishedRef.current,
    onOpen: () => {
      setError(null);
      // If we are reconnecting, we might want to reset finishedRef
      finishedRef.current = false;
    },
    onMessage: (event) => {
      try {
        const msg: WsMsg = JSON.parse(event.data);

        // Handle JsonPatch messages
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

        // Handle finished messages
        if ('finished' in msg) {
          finishedRef.current = true;
          getWebSocket()?.close(1000, 'finished');
        }
      } catch (err) {
        console.error('Failed to process WebSocket message:', err);
        setError('Failed to process stream update');
      }
    },
    onError: () => {
      setError('Connection failed');
    },
  });

  return {
    data,
    isConnected: readyState === ReadyState.OPEN,
    error,
  };
};
