import { generateDiffFile } from '@git-diff-view/file';
import { useDiffEntries } from '@/hooks/useDiffEntries';
import { useMemo, useContext, useCallback, useState, useEffect } from 'react';
import {
  TaskSelectedAttemptContext,
  TaskAttemptDataContext,
} from '@/components/context/taskDetailsContext.ts';
import { Diff } from 'shared/types';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import DiffCard from '@/components/DiffCard';
import { FileText } from 'lucide-react';

function DiffTab() {
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);
  const { isAttemptRunning } = useContext(TaskAttemptDataContext);
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const { diffs, error } = useDiffEntries(selectedAttempt?.id ?? null, true);

  useEffect(() => {
    if (diffs.length > 0) {
      setLoading(false);
    } else if (!isAttemptRunning) {
      // If attempt is not running and we have no diffs, stop loading
      // Add a small delay to ensure any pending diffs are received
      const timer = setTimeout(() => {
        setLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [diffs, isAttemptRunning]);

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

  const { files: diffFiles, totals } = useMemo(() => {
    const files = diffs
      .map((diff) => createDiffFile(diff))
      .filter((diffFile) => diffFile !== null);

    const totals = files.reduce(
      (acc, file) => {
        acc.added += file.additionLength ?? 0;
        acc.deleted += file.deletionLength ?? 0;
        return acc;
      },
      { added: 0, deleted: 0 }
    );

    return { files, totals };
  }, [diffs, createDiffFile]);

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allCollapsed = collapsedIds.size === diffFiles.length;
  const handleCollapseAll = useCallback(() => {
    setCollapsedIds(
      allCollapsed
        ? new Set()
        : new Set(diffFiles.map((diffFile) => diffFile._newFileName))
    );
  }, [allCollapsed, diffFiles]);

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

  if (diffFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm font-medium">No file changes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {diffFiles.length > 0 && (
        <div className="sticky top-0 bg-background border-b px-4 py-2 z-10">
          <div className="flex items-center justify-between gap-4">
            <span
              className="text-xs font-mono whitespace-nowrap"
              aria-live="polite"
              style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
            >
              {diffFiles.length} file{diffFiles.length === 1 ? '' : 's'}{' '}
              changed,{' '}
              <span style={{ color: 'hsl(var(--console-success))' }}>
                +{totals.added}
              </span>{' '}
              <span style={{ color: 'hsl(var(--console-error))' }}>
                -{totals.deleted}
              </span>
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={handleCollapseAll}
              className="shrink-0"
            >
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </Button>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4">
        {diffFiles.map((diffFile, idx) => (
          <DiffCard
            key={idx}
            diffFile={diffFile}
            isCollapsed={collapsedIds.has(diffFile._newFileName)}
            onToggle={() => toggle(diffFile._newFileName)}
          />
        ))}
      </div>
    </div>
  );
}

export default DiffTab;
