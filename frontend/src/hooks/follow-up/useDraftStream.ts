import { useCallback, useEffect, useRef, useState } from 'react';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import { attemptsApi } from '@/lib/api';
import type { FollowUpDraft } from 'shared/types';
import { inIframe } from '@/vscode/bridge';

type DraftStreamState = { follow_up_draft: FollowUpDraft };

export function useDraftStream(attemptId?: string) {
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const lastServerVersionRef = useRef<number>(-1);
  const suppressNextSaveRef = useRef<boolean>(false);
  const forceNextApplyRef = useRef<boolean>(false);

  const endpoint = attemptId
    ? `/api/task-attempts/${attemptId}/follow-up-draft/stream/ws`
    : undefined;

  const makeInitial = useCallback(
    (): DraftStreamState => ({
      follow_up_draft: {
        id: '',
        task_attempt_id: attemptId || '',
        prompt: '',
        queued: false,
        sending: false,
        variant: null,
        image_ids: [],
        version: 0n,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }),
    [attemptId]
  );

  const { data, isConnected, error } = useJsonPatchWsStream<DraftStreamState>(
    endpoint,
    !!endpoint,
    makeInitial
  );

  // Quick initial draft loading from REST
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      if (!attemptId) return;
      try {
        const d = await attemptsApi.getFollowUpDraft(attemptId);
        if (cancelled) return;
        suppressNextSaveRef.current = true;
        setDraft({
          id: 'rest',
          task_attempt_id: d.task_attempt_id,
          prompt: d.prompt || '',
          queued: !!d.queued,
          sending: false,
          variant: (d.variant ?? null) as string | null,
          image_ids: (d.image_ids ?? []) as string[],
          version: (d.version ?? 0n) as unknown as bigint,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (!isDraftLoaded) setIsDraftLoaded(true);
      } catch {
        // ignore, rely on stream
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [attemptId, isDraftLoaded]);

  // Handle stream updates
  useEffect(() => {
    if (!data) return;
    const d = data.follow_up_draft;
    if (d.id === '') return;
    const incomingVersion = Number(d.version ?? 0n);
    if (incomingVersion === lastServerVersionRef.current) {
      if (!isDraftLoaded) setIsDraftLoaded(true);
      return;
    }
    suppressNextSaveRef.current = true;
    // Let consumers decide whether to apply or ignore based on local dirty/forceApply.
    setDraft(d);
    if (!isDraftLoaded) setIsDraftLoaded(true);
  }, [data, isDraftLoaded]);

  // VSCode iframe poll fallback
  const pollTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!attemptId) return;
    const shouldPoll = inIframe() && (!isConnected || !!error);
    if (!shouldPoll) {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
      return;
    }
    const pollOnce = async () => {
      try {
        const d = await attemptsApi.getFollowUpDraft(attemptId);
        const incomingVersion = Number((d as FollowUpDraft).version ?? 0n);
        if (incomingVersion !== lastServerVersionRef.current) {
          suppressNextSaveRef.current = true;
          setDraft({
            id: 'rest',
            task_attempt_id: d.task_attempt_id,
            prompt: d.prompt || '',
            queued: !!d.queued,
            sending: false,
            variant: (d.variant ?? null) as string | null,
            image_ids: (d.image_ids ?? []) as string[],
            version: (d.version ?? 0n) as unknown as bigint,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          if (!isDraftLoaded) setIsDraftLoaded(true);
        }
      } catch {
        // ignore
      }
    };
    pollOnce();
    pollTimerRef.current = window.setInterval(pollOnce, 1000);
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = undefined;
    };
  }, [attemptId, isConnected, error, isDraftLoaded]);

  return {
    draft,
    isDraftLoaded,
    isConnected,
    error,
    lastServerVersionRef,
    suppressNextSaveRef,
    forceNextApplyRef,
  } as const;
}
