import { useDiffStream } from '@/hooks/useDiffStream';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import DiffViewSwitch from '@/components/DiffViewSwitch';
import DiffCard from '@/components/DiffCard';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import { NewCardHeader } from '@/components/ui/new-card';
import { ChevronsUp, ChevronsDown } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TaskAttempt, Diff } from 'shared/types';
import GitOperations, {
  type GitOperationsInputs,
} from '@/components/tasks/Toolbar/GitOperations.tsx';

interface DiffsPanelProps {
  selectedAttempt: TaskAttempt | null;
  gitOps?: GitOperationsInputs;
}

export function DiffsPanel({ selectedAttempt, gitOps }: DiffsPanelProps) {
  const { t } = useTranslation('tasks');
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [hasInitialized, setHasInitialized] = useState(false);
  const { diffs, error } = useDiffStream(selectedAttempt?.id ?? null, true);
  const { fileCount, added, deleted } = useDiffSummary(
    selectedAttempt?.id ?? null
  );

  useEffect(() => {
    setLoading(true);
    setHasInitialized(false);
  }, [selectedAttempt?.id]);

  useEffect(() => {
    setLoading(true);
  }, [selectedAttempt?.id]);

  useEffect(() => {
    if (diffs.length > 0 && loading) {
      setLoading(false);
    }
  }, [diffs, loading]);

  // If no diffs arrive within 3 seconds, stop showing the spinner
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      if (diffs.length === 0) {
        setLoading(false);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, diffs.length]);

  // Default-collapse certain change kinds on first load only
  useEffect(() => {
    if (diffs.length === 0) return;
    if (hasInitialized) return; // only run once per attempt
    const kindsToCollapse = new Set([
      'deleted',
      'renamed',
      'copied',
      'permissionChange',
    ]);
    const initial = new Set(
      diffs
        .filter((d) => kindsToCollapse.has(d.change))
        .map((d, i) => d.newPath || d.oldPath || String(i))
    );
    if (initial.size > 0) setCollapsedIds(initial);
    setHasInitialized(true);
  }, [diffs, hasInitialized]);

  const ids = useMemo(() => {
    return diffs.map((d, i) => d.newPath || d.oldPath || String(i));
  }, [diffs]);

  const toggle = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const allCollapsed = collapsedIds.size === diffs.length;
  const handleCollapseAll = useCallback(() => {
    setCollapsedIds(allCollapsed ? new Set() : new Set(ids));
  }, [allCollapsed, ids]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="text-red-800 text-sm">
          {t('diff.errorLoadingDiff', { error })}
        </div>
      </div>
    );
  }

  return (
    <DiffsPanelContent
      diffs={diffs}
      fileCount={fileCount}
      added={added}
      deleted={deleted}
      collapsedIds={collapsedIds}
      allCollapsed={allCollapsed}
      handleCollapseAll={handleCollapseAll}
      toggle={toggle}
      selectedAttempt={selectedAttempt}
      gitOps={gitOps}
      loading={loading}
      t={t}
    />
  );
}

interface DiffsPanelContentProps {
  diffs: Diff[];
  fileCount: number;
  added: number;
  deleted: number;
  collapsedIds: Set<string>;
  allCollapsed: boolean;
  handleCollapseAll: () => void;
  toggle: (id: string) => void;
  selectedAttempt: TaskAttempt | null;
  gitOps?: GitOperationsInputs;
  loading: boolean;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function DiffsPanelContent({
  diffs,
  fileCount,
  added,
  deleted,
  collapsedIds,
  allCollapsed,
  handleCollapseAll,
  toggle,
  selectedAttempt,
  gitOps,
  loading,
  t,
}: DiffsPanelContentProps) {
  return (
    <div className="h-full flex flex-col relative">
      {diffs.length > 0 && (
        <NewCardHeader
          className="sticky top-0 z-10"
          actions={
            <>
              <DiffViewSwitch />
              <div className="h-4 w-px bg-border" />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="icon"
                      onClick={handleCollapseAll}
                      aria-pressed={allCollapsed}
                      aria-label={
                        allCollapsed
                          ? t('diff.expandAll')
                          : t('diff.collapseAll')
                      }
                    >
                      {allCollapsed ? (
                        <ChevronsDown className="h-4 w-4" />
                      ) : (
                        <ChevronsUp className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {allCollapsed ? t('diff.expandAll') : t('diff.collapseAll')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          }
        >
          <div className="flex items-center">
            <span
              className="text-sm text-muted-foreground whitespace-nowrap"
              aria-live="polite"
            >
              {t('diff.filesChanged', { count: fileCount })}{' '}
              <span className="text-green-600 dark:text-green-500">
                +{added}
              </span>{' '}
              <span className="text-red-600 dark:text-red-500">-{deleted}</span>
            </span>
          </div>
        </NewCardHeader>
      )}
      {gitOps && selectedAttempt && (
        <div className="px-3">
          <GitOperations selectedAttempt={selectedAttempt} {...gitOps} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : diffs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {t('diff.noChanges')}
          </div>
        ) : (
          diffs.map((diff, idx) => {
            const id = diff.newPath || diff.oldPath || String(idx);
            return (
              <DiffCard
                key={id}
                diff={diff}
                expanded={!collapsedIds.has(id)}
                onToggle={() => toggle(id)}
                selectedAttempt={selectedAttempt}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
