import { generateDiffFile } from '@git-diff-view/file';
import { useDiffEntries } from '@/hooks/useDiffEntries';
import { useMemo, useContext, useCallback, useState, useEffect } from 'react';
import { TaskSelectedAttemptContext } from '@/components/context/taskDetailsContext.ts';
import { Diff } from 'shared/types';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { Loader } from '@/components/ui/loader';
import DiffCard from '@/components/DiffCard';

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const [loading, setLoading] = useState(true);
  const { diffs, error } = useDiffEntries(selectedAttempt?.id ?? null, true);

  useEffect(() => {
    if (diffs.length > 0 && loading) {
      setLoading(false);
    }
  }, [diffs, loading]);

  const createDiffFile = useCallback((diff: Diff) => {
    const oldFileName = diff.oldFile?.fileName || 'old';
    const newFileName = diff.newFile?.fileName || 'new';
    const oldContent = diff.oldFile?.content || '';
    const newContent = diff.newFile?.content || '';

    try {
      const instance = generateDiffFile(
        oldFileName,
        oldContent,
        newFileName,
        newContent,
        getHighLightLanguageFromPath(oldFileName) || 'plaintext',
        getHighLightLanguageFromPath(newFileName) || 'plaintext'
      );
      instance.initRaw();
      return instance;
    } catch (error) {
      console.error('Failed to parse diff:', error);
      return null;
    }
  }, []);

  const diffFiles = useMemo(() => {
    return diffs
      .map((diff) => createDiffFile(diff))
      .filter((diffFile) => diffFile !== null);
  }, [diffs, createDiffFile]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">Failed to load diff: {error}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto px-4">
        {diffFiles.map((diffFile, idx) => (
          <DiffCard key={idx} diffFile={diffFile} />
        ))}
      </div>
    </div>
  );
}

export default DiffTab;
