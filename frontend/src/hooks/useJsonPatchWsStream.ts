import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';
import useWebSocket, { ReadyState } from 'react-use-websocket';

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
}

// Track one-time initialization side-effects per URL
const injectedOnce = new Set<string>();

function toWsUrl(endpoint?: string): string | undefined {
  if (!endpoint) return undefined;
  try {
    const url = new URL(endpoint, window.location.origin);
    url.protocol = url.protocol.replace('http', 'ws');
    return url.toString();
  } catch {
    return undefined;
  }
}

export const useJsonPatchWsStream = <T>(
  endpoint: string | undefined,
  enabled: boolean,
  initialData: () => T,
  options: UseJsonPatchStreamOptions<T> = {}
): UseJsonPatchStreamResult<T> => {
  const [error, setError] = useState<string | null>(null);
  const wsUrl = useMemo(() => toWsUrl(endpoint), [endpoint]);
  const queryKey = useMemo(() => ['ws-json-patch', wsUrl], [wsUrl]);
  const qc = useQueryClient();

  // Use React Query as the shared state store
  const { data } = useQuery<T | undefined>({
    queryKey,
    enabled: !!wsUrl && enabled,
    // Keep the snapshot indefinitely while mounted; GC immediately when unused
    staleTime: Infinity,
    gcTime: 0,
    initialData: undefined,
  });

  // Ensure initial snapshot exists once when the stream becomes enabled
  useEffect(() => {
    if (!wsUrl || !enabled) return;
    const existing = qc.getQueryData<T | undefined>(queryKey);
    if (existing === undefined) {
      const init = initialData();
      qc.setQueryData<T>(queryKey, init);
    }
  }, [wsUrl, enabled, qc, queryKey, initialData]);

  // One-time injection per stream URL
  useEffect(() => {
    if (!wsUrl || !enabled || !options.injectInitialEntry) return;
    if (injectedOnce.has(wsUrl)) return;
    const snapshot = (qc.getQueryData<T>(queryKey) ?? initialData()) as T;
    try {
      options.injectInitialEntry(snapshot);
    } catch (e) {
      console.error('injectInitialEntry failed', e);
    } finally {
      injectedOnce.add(wsUrl);
    }
  }, [wsUrl, enabled, qc, queryKey, initialData, options.injectInitialEntry]);

  const { readyState, getWebSocket } = useWebSocket(
    wsUrl ?? 'ws://invalid',
    {
      share: true,
      shouldReconnect: () => true,
      reconnectInterval: (attempt) =>
        Math.min(8000, 1000 * Math.pow(2, attempt)),
      retryOnError: true,
      onOpen: () => {
        setError(null);
      },
      onMessage: (event) => {
        try {
          const msg: WsMsg = JSON.parse(event.data);
          if ('JsonPatch' in msg) {
            const patches: Operation[] = msg.JsonPatch;
            const filtered = options.deduplicatePatches
              ? options.deduplicatePatches(patches)
              : patches;
            if (!filtered.length) return;
            // Functional update to avoid stale closures; shared across subscribers
            qc.setQueryData<T | undefined>(queryKey, (prev) => {
              const base = (prev ?? initialData()) as T;
              const next = structuredClone(base);
              applyPatch(next as any, filtered);
              return next;
            });
          } else if ('finished' in msg) {
            try {
              getWebSocket()?.close();
            } catch {
              /* ignore */
            }
          }
        } catch (e) {
          console.error('Failed to process WebSocket message:', e);
          setError('Failed to process stream update');
        }
      },
      onError: () => {
        setError('Connection failed');
      },
    },
    !!wsUrl && enabled
  );

  const isConnected = enabled && !!wsUrl && readyState === ReadyState.OPEN;
  // Match old semantics: if not enabled/url, surface undefined data
  const resultData = enabled && !!wsUrl ? (data as T | undefined) : undefined;
  return { data: resultData, isConnected, error };
};
