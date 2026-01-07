import { useDiffStream } from '@/hooks/useDiffStream';
import { useMemo } from 'react';

const STATS_ONLY_OPTIONS = { statsOnly: true };

export function useDiffSummary(attemptId: string | null) {
  const { diffs, error } = useDiffStream(attemptId, true, STATS_ONLY_OPTIONS);

  const { fileCount, added, deleted } = useMemo(() => {
    if (!attemptId || diffs.length === 0) {
      return { fileCount: 0, added: 0, deleted: 0 };
    }

    return diffs.reduce(
      (acc, d) => {
        acc.added += d.additions ?? 0;
        acc.deleted += d.deletions ?? 0;
        return acc;
      },
      { fileCount: diffs.length, added: 0, deleted: 0 }
    );
  }, [attemptId, diffs]);

  return { fileCount, added, deleted, error };
}
