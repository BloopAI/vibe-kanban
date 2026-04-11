import { useDiffStream } from '@/shared/hooks/useDiffStream';
import { useMemo } from 'react';

export function useDiffSummary(workspaceId: string | null) {
  const { diffs, error } = useDiffStream(workspaceId, true, {
    statsOnly: true,
  });

  const { fileCount, added, deleted } = useMemo(() => {
    if (!workspaceId || diffs.length === 0) {
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
  }, [workspaceId, diffs]);

  return { fileCount, added, deleted, error };
}
