import { useDiffStream } from '@/hooks/useDiffStream';
import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
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
import { useScrollToLineStore } from '@/stores/useScrollToLineStore';
import { useDiffViewMode, type DiffViewMode } from '@/stores/useDiffViewStore';

/**
 * Scroll to a specific line in the diff view
 */
function scrollToLine(
  _filePath: string,
  lineNumber: number,
  side: 'old' | 'new',
  diffViewMode: DiffViewMode
) {
  // Build the query selector based on view mode
  // In unified view, lines use data-line-old-num or data-line-new-num
  // In split view, lines use data-line and data-side
  let selector: string;
  if (diffViewMode === 'split') {
    const dataSide = side === 'old' ? 'old' : 'new';
    selector = `tr[data-line="${lineNumber}"][data-side="${dataSide}"]`;
  } else {
    // Unified view
    const attr = side === 'old' ? 'data-line-old-num' : 'data-line-new-num';
    selector = `tr:has([${attr}="${lineNumber}"])`;
  }

  const element = document.querySelector(selector);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Add a brief highlight effect
    element.classList.add('bg-primary/20');
    setTimeout(() => {
      element.classList.remove('bg-primary/20');
    }, 2000);
  }
}

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

  // Scroll-to-line handling for code references
  const scrollTarget = useScrollToLineStore((s) => s.scrollTarget);
  const clearScrollTarget = useScrollToLineStore((s) => s.clearScrollTarget);
  const diffViewMode = useDiffViewMode();
  const pendingScrollRef = useRef<{
    filePath: string;
    lineNumber: number;
    side: 'old' | 'new';
  } | null>(null);

  // Handle scroll target changes
  useEffect(() => {
    if (!scrollTarget) return;

    const { filePath, lineNumber, side } = scrollTarget;

    // Find the diff by file path
    const diffIndex = diffs.findIndex(
      (d) => d.newPath === filePath || d.oldPath === filePath
    );
    if (diffIndex === -1) {
      clearScrollTarget();
      return;
    }

    const diffId =
      diffs[diffIndex].newPath || diffs[diffIndex].oldPath || String(diffIndex);

    // Check if diff is collapsed
    if (collapsedIds.has(diffId)) {
      // Store the scroll target and expand the diff
      pendingScrollRef.current = { filePath, lineNumber, side };
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(diffId);
        return next;
      });
      clearScrollTarget();
      return;
    }

    // Diff is already expanded, scroll to line
    scrollToLine(filePath, lineNumber, side, diffViewMode);
    clearScrollTarget();
  }, [scrollTarget, diffs, collapsedIds, clearScrollTarget, diffViewMode]);

  // Handle scrolling after a diff is expanded
  useEffect(() => {
    if (!pendingScrollRef.current) return;

    const { filePath, lineNumber, side } = pendingScrollRef.current;

    // Find the diff and check if it's now expanded
    const diffIndex = diffs.findIndex(
      (d) => d.newPath === filePath || d.oldPath === filePath
    );
    if (diffIndex === -1) {
      pendingScrollRef.current = null;
      return;
    }

    const diffId =
      diffs[diffIndex].newPath || diffs[diffIndex].oldPath || String(diffIndex);
    if (!collapsedIds.has(diffId)) {
      // Diff is now expanded, scroll after a small delay for DOM to update
      const timer = setTimeout(() => {
        scrollToLine(filePath, lineNumber, side, diffViewMode);
        pendingScrollRef.current = null;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [collapsedIds, diffs, diffViewMode]);

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
