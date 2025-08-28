import { useDiffEntries } from '@/hooks/useDiffEntries';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { generateDiffFile } from '@git-diff-view/file';
import { useMemo } from 'react';

export function useDiffSummary(attemptId: string | null) {
  const { diffs, error, isConnected } = useDiffEntries(attemptId, true);

  const { fileCount, added, deleted } = useMemo(() => {
    if (!attemptId || diffs.length === 0) {
      return { fileCount: 0, added: 0, deleted: 0 };
    }

    return diffs.reduce(
      (acc, d) => {
        try {
          const oldName = d.oldPath || d.newPath || 'old';
          const newName = d.newPath || d.oldPath || 'new';
          const oldContent = d.oldContent || '';
          const newContent = d.newContent || '';
          const oldLang = getHighLightLanguageFromPath(oldName) || 'plaintext';
          const newLang = getHighLightLanguageFromPath(newName) || 'plaintext';

          const file = generateDiffFile(
            oldName,
            oldContent,
            newName,
            newContent,
            oldLang,
            newLang
          );
          file.initRaw();
          acc.added += file.additionLength ?? 0;
          acc.deleted += file.deletionLength ?? 0;
        } catch (e) {
          console.error('Failed to compute totals for diff', e);
        }
        return acc;
      },
      { fileCount: diffs.length, added: 0, deleted: 0 }
    );
  }, [attemptId, diffs]);

  return { fileCount, added, deleted, isConnected, error };
}
