import { useCallback } from 'react';
import type { FileDiff } from 'shared/types';
import { useJsonPatchStream } from './useJsonPatchStream';

interface DiffState {
  entries: Record<string, FileDiff>;
}

interface UseDiffStreamResult {
  diff: DiffState | undefined;
  isConnected: boolean;
  error: string | null;
}

export const useDiffStream = (
  attemptId: string | null,
  enabled: boolean
): UseDiffStreamResult => {
  const endpoint = attemptId ? `/api/task-attempts/${attemptId}/diff` : undefined;

  const initialData = useCallback((): DiffState => ({
    entries: {},
  }), []);

  const { data, isConnected, error } = useJsonPatchStream(
    endpoint,
    enabled && !!attemptId,
    initialData
    // No need for injectInitialEntry or deduplicatePatches for diffs
  );

  return { diff: data, isConnected, error };
};
