import { useCallback, useEffect, useRef, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsFinishedMsg = { finished: boolean };
type WsMsg = WsJsonPatchMsg | WsFinishedMsg;

interface UseJsonPatchStreamOptions<T> {
  injectInitialEntry?: (data: T) => void;
  deduplicatePatches?: (patches: Operation[]) => Operation[];
}

interface UseJsonPatchStreamResult<T> {
  data: T | undefined;
  isConnected: boolean;
  error: string | null;
  refresh: () => void;
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
  const [reconnectKey, setReconnectKey] = useState(0);

  const injectInitialEntry = options?.injectInitialEntry;
  const deduplicatePatches = options?.deduplicatePatches;

  const wsUrl =
    enabled && endpoint
      ? `${endpoint.replace(/^http/, 'ws')}${endpoint.includes('?') ? '&' : '?'}_rk=${reconnectKey}`
      : null;

  const { lastJsonMessage, readyState } = useWebSocket<WsMsg>(
    wsUrl,
    {
      shouldReconnect: (closeEvent) => {
        if (finishedRef.current) return false;
        if (closeEvent.code === 1000 && closeEvent.wasClean) return false;
        return true;
      },
      reconnectAttempts: 20,
      reconnectInterval: (attemptNumber) =>
        Math.min(8000, 1000 * Math.pow(2, attemptNumber)),
      retryOnError: true,
      onOpen: () => setError(null),
      onError: () => setError('Connection failed'),
    },
    enabled && !!endpoint
  );

  useEffect(() => {
    if (!enabled || !endpoint) {
      dataRef.current = undefined;
      setData(undefined);
      finishedRef.current = false;
      return;
    }

    if (!dataRef.current) {
      dataRef.current = initialData();
      if (injectInitialEntry) {
        injectInitialEntry(dataRef.current);
      }
    }
  }, [enabled, endpoint, initialData, injectInitialEntry]);

  useEffect(() => {
    if (reconnectKey > 0) {
      finishedRef.current = false;
    }
  }, [reconnectKey]);

  useEffect(() => {
    if (!lastJsonMessage) return;

    if ('finished' in lastJsonMessage) {
      finishedRef.current = true;
      return;
    }

    if ('JsonPatch' in lastJsonMessage) {
      const patches = lastJsonMessage.JsonPatch;
      const filtered = deduplicatePatches
        ? deduplicatePatches(patches)
        : patches;

      const current = dataRef.current;
      if (!filtered.length || !current) return;

      const next = structuredClone(current);
      applyPatch(next, filtered);
      dataRef.current = next;
      setData(next);
    }
  }, [lastJsonMessage, deduplicatePatches]);

  const refresh = useCallback(() => {
    setReconnectKey((k) => k + 1);
  }, []);

  return {
    data,
    isConnected: readyState === ReadyState.OPEN,
    error,
    refresh,
  };
};
