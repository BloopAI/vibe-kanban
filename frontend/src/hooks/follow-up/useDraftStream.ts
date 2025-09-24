import { useMemo } from 'react';
import type { Draft } from 'shared/types';
import { useProject } from '@/contexts/project-context';
import {
  useProjectDraftsStream,
  type DraftResponse,
  type DraftsState,
} from './useProjectDraftsStream';

export function useDraftStream(attemptId?: string) {
  const { projectId } = useProject();
  const { data, isConnected, error } = useProjectDraftsStream(projectId);

  const attemptDrafts = useMemo((): {
    follow_up: Draft;
    retry: DraftResponse | null;
  } | null => {
    if (!attemptId || !data)
      return null as null | {
        follow_up: Draft;
        retry: DraftResponse | null;
      };
    return (data as DraftsState).drafts[attemptId] ?? null;
  }, [data, attemptId]);

  return {
    draft: attemptDrafts?.follow_up ?? null,
    retryDraft: attemptDrafts?.retry ?? null,
    isRetryLoaded: !!attemptDrafts,
    isDraftLoaded: !!attemptDrafts,
    isConnected,
    error,
  } as const;
}
