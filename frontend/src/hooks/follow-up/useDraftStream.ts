import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { applyPatch } from 'rfc6902';
import type { Operation } from 'rfc6902';
import useWebSocket from 'react-use-websocket';
import type { Draft, DraftResponse } from 'shared/types';
import { useProject } from '@/contexts/ProjectContext';

interface Drafts {
  [attemptId: string]: { follow_up: Draft; retry: DraftResponse | null };
}

type DraftsContainer = {
  drafts: Drafts;
};

type WsJsonPatchMsg = { JsonPatch: Operation[] };
type WsFinishedMsg = { finished: boolean };
type WsMsg = WsJsonPatchMsg | WsFinishedMsg;

export function useDraftStream(attemptId?: string) {
  const { projectId } = useProject();
  const drafts = useDraftsStreamState(projectId);

  const attemptDrafts = useMemo(() => {
    if (!attemptId || !drafts) return null;
    return drafts[attemptId] ?? null;
  }, [drafts, attemptId]);

  return {
    draft: attemptDrafts?.follow_up ?? null,
    retryDraft: attemptDrafts?.retry ?? null,
    isRetryLoaded: !!attemptDrafts,
    isDraftLoaded: !!attemptDrafts,
  } as const;
}

function useDraftsStreamState(projectId?: string): Drafts | undefined {
  const endpoint = useMemo(
    () =>
      projectId
        ? `/api/drafts/stream/ws?project_id=${encodeURIComponent(projectId)}`
        : undefined,
    [projectId]
  );
  const wsUrl = useMemo(() => toWsUrl(endpoint), [endpoint]);
  const isStreamEnabled = !!endpoint && !!wsUrl;

  const queryClient = useQueryClient();
  const initialData = useCallback((): DraftsContainer => ({ drafts: {} }), []);
  const queryKey = useMemo(() => ['ws-json-patch', wsUrl], [wsUrl]);

  const { data } = useQuery<DraftsContainer>({
    queryKey,
    queryFn: initialData, // Defensive fallback (won't run because enabled: false)
    enabled: false, // State holder only - data comes from WebSocket
    staleTime: Infinity,
    gcTime: 0,
    initialData,
  });

  const { getWebSocket } = useWebSocket(
    wsUrl ?? 'ws://invalid',
    {
      share: true,
      shouldReconnect: () => true,
      reconnectInterval: (attempt) =>
        Math.min(8000, 1000 * Math.pow(2, attempt)),
      retryOnError: true,
      onMessage: (event) => {
        try {
          const msg: WsMsg = JSON.parse(event.data);
          if ('JsonPatch' in msg) {
            const patches = msg.JsonPatch;
            if (!patches.length) return;
            queryClient.setQueryData<DraftsContainer>(queryKey, (prev) => {
              const base = prev ?? initialData();
              const next = structuredClone(base) as DraftsContainer;
              applyPatch(next, patches);
              return next;
            });
          } else if ('finished' in msg) {
            try {
              getWebSocket()?.close();
            } catch {
              /* noop */
            }
          }
        } catch (e) {
          console.error('Failed to process WebSocket message:', e);
        }
      },
    },
    isStreamEnabled
  );

  return isStreamEnabled ? data.drafts : undefined;
}

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
