import { useDiffEntries } from '@/hooks/useDiffEntries';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import DiffViewSwitch from '@/components/diff-view-switch';
import DiffCard from '@/components/DiffCard';
import { useDiffSummary } from '@/hooks/useDiffSummary';
import type { TaskAttempt } from 'shared/types';

interface DiffTabProps {
  selectedAttempt: TaskAttempt | null;
}

function DiffTab({ selectedAttempt }: DiffTabProps) {
  const [loading, setLoading] = useState(true);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [hasInitialized, setHasInitialized] = useState(false);
  const { diffs, error } = useDiffEntries(selectedAttempt?.id ?? null, true);
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

  if (!loading && diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No changes have been made yet
      </div>
    );
  }

  return (
    <DiffTabContent
      diffs={diffs}
      fileCount={fileCount}
      added={added}
      deleted={deleted}
      collapsedIds={collapsedIds}
      allCollapsed={allCollapsed}
      handleCollapseAll={handleCollapseAll}
      toggle={toggle}
      selectedAttempt={selectedAttempt}
    />
  );
}

interface DiffTabContentProps {
  diffs: any[];
  fileCount: number;
  added: number;
  deleted: number;
  collapsedIds: Set<string>;
  allCollapsed: boolean;
  handleCollapseAll: () => void;
  toggle: (id: string) => void;
  selectedAttempt: TaskAttempt | null;
}

function DiffTabContent({
  diffs,
  fileCount,
  added,
  deleted,
  collapsedIds,
  allCollapsed,
  handleCollapseAll,
  toggle,
  selectedAttempt,
}: DiffTabContentProps) {
  return (
    <div className="h-full flex flex-col relative">
      {diffs.length > 0 && (
        <div className="sticky top-0 bg-background border-b px-4 py-2 z-10">
          <div className="flex items-center justify-between gap-4">
            <span
              className="text-xs font-mono whitespace-nowrap"
              aria-live="polite"
              style={{ color: 'hsl(var(--muted-foreground) / 0.7)' }}
            >
              {fileCount} file{fileCount === 1 ? '' : 's'} changed,{' '}
              <span style={{ color: 'hsl(var(--console-success))' }}>
                +{added}
              </span>{' '}
              <span style={{ color: 'hsl(var(--console-error))' }}>
                -{deleted}
              </span>
            </span>
            <div className="flex items-center gap-2">
              <DiffViewSwitch />
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
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4">
        {diffs.map((diff, idx) => {
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
        })}
      </div>
    </div>
  );
}

export default DiffTab;
