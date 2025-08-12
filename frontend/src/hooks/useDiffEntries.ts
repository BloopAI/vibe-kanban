import { useMemo } from 'react';
import { useDiffStream } from './useDiffStream';
import type { Diff, PatchType } from 'shared/types';

interface UseDiffEntriesResult {
  diffs: Diff[];
  isConnected: boolean;
  error: string | null;
}

export const useDiffEntries = (
  attemptId: string | null,
  enabled: boolean
): UseDiffEntriesResult => {
  const { data, isConnected, error } = useDiffStream(attemptId, enabled);

  const diffs = useMemo(() => {
    if (!data) return [];
    return Object.values(data.entries)
      .filter(
        (e): e is Extract<PatchType, { type: 'DIFF' }> => e?.type === 'DIFF'
      )
      .map((e) => e.content);
  }, [data]);

  return { diffs, isConnected, error };
};
