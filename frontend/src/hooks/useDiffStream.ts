import { useCallback } from 'react';
import type { PatchType } from 'shared/types';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';

interface DiffState {
  entries: Record<string, PatchType>;
}

export interface UseDiffStreamOptions {
  statsOnly?: boolean;
}

interface UseDiffStreamResult {
  data: DiffState | undefined;
  isConnected: boolean;
  error: string | null;
}

export const useDiffStream = (
  attemptId: string | null,
  enabled: boolean,
  options?: UseDiffStreamOptions
): UseDiffStreamResult => {
  const endpoint = (() => {
    if (!attemptId) return undefined;
    const query = `/api/task-attempts/${attemptId}/diff/ws`;
    if (typeof options?.statsOnly === 'boolean') {
      const params = new URLSearchParams();
      params.set('stats_only', String(options.statsOnly));
      return `${query}?${params.toString()}`;
    } else {
      return query;
    }
  })();

  const initialData = useCallback(
    (): DiffState => ({
      entries: {},
    }),
    []
  );

  const { data, isConnected, error } = useJsonPatchWsStream(
    endpoint,
    enabled && !!attemptId,
    initialData
    // No need for injectInitialEntry or deduplicatePatches for diffs
  );

  return { data, isConnected, error };
};
