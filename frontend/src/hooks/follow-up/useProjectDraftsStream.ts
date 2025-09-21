import { useMemo, useCallback } from 'react';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import type { Draft } from 'shared/types';

export type DraftResponse = {
  task_attempt_id: string;
  draft_type: 'follow_up' | 'retry';
  retry_process_id?: string | null;
  prompt: string;
  queued: boolean;
  variant: string | null;
  image_ids: string[] | null;
  version: number;
};

export type DraftsState = {
  drafts: Record<string, { follow_up: Draft; retry: DraftResponse | null }>;
};

export function useProjectDraftsStream(projectId?: string) {
  const endpoint = useMemo(
    () =>
      projectId
        ? `/api/drafts/stream/ws?project_id=${encodeURIComponent(projectId)}`
        : undefined,
    [projectId]
  );

  const makeInitial = useCallback(() => ({ drafts: {} }) as DraftsState, []);
  const { data, isConnected, error } = useJsonPatchWsStream<DraftsState>(
    endpoint,
    !!endpoint,
    makeInitial
  );

  return { data, isConnected, error } as const;
}
