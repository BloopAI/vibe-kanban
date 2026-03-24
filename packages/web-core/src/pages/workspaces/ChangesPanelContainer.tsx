import { memo, useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  ChangesPanel,
  type ChangesPanelHandle,
  type RenderDiffItemProps,
} from '@vibe/ui/components/ChangesPanel';
import { sortDiffs } from '@/shared/lib/fileTreeUtils';
import { useChangesView } from '@/shared/hooks/useChangesView';
import { useDiffs } from '@/shared/stores/useWorkspaceDiffStore';
import { useScrollSyncStateMachine } from '@/shared/hooks/useScrollSyncStateMachine';
import { usePersistedExpanded } from '@/shared/stores/useUiPreferencesStore';
import { preloadHighlighter } from '@pierre/diffs';
import { PierreDiffCard } from './PierreDiffCard';
import type { Diff, DiffChangeKind } from 'shared/types';

let highlighterPreloaded = false;
function ensureHighlighterPreloaded() {
  if (highlighterPreloaded) return;
  highlighterPreloaded = true;
  const t0 = performance.now();
  preloadHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [],
  }).then(() => {
    cpcLog(`highlighter preloaded in ${(performance.now() - t0).toFixed(0)}ms`);
  });
}

const PERF_DEBUG = true;
function cpcLog(label: string, ...args: unknown[]) {
  if (!PERF_DEBUG) return;
  console.log(`%c[Container] ${label}`, 'color: #ffb74d', ...args);
}
function cpcWarn(label: string, ...args: unknown[]) {
  if (!PERF_DEBUG) return;
  console.log(`[Container] ${label}`, ...args);
}

/**
 * Scroll to a specific line inside a Pierre diff.
 * Pierre renders diff lines inside a `<diffs-container>` custom element
 * with an open shadow DOM — regular querySelector can't reach [data-line].
 */
function scrollToLineInDiff(
  fileEl: HTMLElement,
  lineNumber: number,
  onComplete?: () => void
): void {
  const container = fileEl.querySelector('diffs-container');
  const shadowRoot = container?.shadowRoot ?? null;
  if (shadowRoot) {
    const lineEl = shadowRoot.querySelector(`[data-line="${lineNumber}"]`);
    if (lineEl instanceof HTMLElement) {
      lineEl.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }
  onComplete?.();
}

// Auto-collapse defaults based on change type (matches DiffsPanel behavior)
const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false, // Expand added files
  deleted: true, // Collapse deleted files
  modified: false, // Expand modified files
  renamed: true, // Collapse renamed files
  copied: true, // Collapse copied files
  permissionChange: true, // Collapse permission changes
};

// Collapse large diffs (over 200 lines)
const COLLAPSE_MAX_LINES = 200;

function shouldAutoCollapse(diff: Diff): boolean {
  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);

  // For renamed files, only collapse if there are no content changes
  // OR if the diff is large
  if (diff.change === 'renamed') {
    return totalLines === 0 || totalLines > COLLAPSE_MAX_LINES;
  }

  // Collapse based on change type for other types
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }

  // Collapse large diffs
  if (totalLines > COLLAPSE_MAX_LINES) {
    return true;
  }

  return false;
}

interface ChangesPanelContainerProps {
  className: string;
  /** Attempt ID for opening files in IDE */
  workspaceId: string;
}

const PersistedDiffItem = memo(function PersistedDiffItem({
  diff,
  initialExpanded,
  workspaceId,
}: {
  diff: Diff;
  initialExpanded: boolean;
  workspaceId: string;
}) {
  const path = diff.newPath || diff.oldPath || '';
  const [expanded, toggle] = usePersistedExpanded(
    `diff:${path}`,
    initialExpanded
  );

  return (
    <PierreDiffCard
      diff={diff}
      expanded={expanded}
      onToggle={toggle}
      workspaceId={workspaceId}
      className=""
    />
  );
});

export function ChangesPanelContainer({
  className,
  workspaceId,
}: ChangesPanelContainerProps) {
  ensureHighlighterPreloaded();
  const diffs = useDiffs();
  const {
    selectedFilePath,
    selectedLineNumber,
    setFileInView,
    registerScrollToFile,
  } = useChangesView();
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const changesPanelRef = useRef<ChangesPanelHandle>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const visibleRangeRef = useRef<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: 0,
  });
  const [processedPaths] = useState(() => new Set<string>());

  const diffItems = useMemo(() => {
    const t0 = performance.now();
    const sorted = sortDiffs(diffs);
    const sortElapsed = performance.now() - t0;
    if (sortElapsed > 5) cpcWarn(`sortDiffs ${sortElapsed.toFixed(1)}ms for ${diffs.length} diffs`);
    cpcLog(`diffItems recompute: ${diffs.length} diffs, sort=${sortElapsed.toFixed(1)}ms`);
    return sorted.map((diff) => {
      const path = diff.newPath || diff.oldPath || '';

      let initialExpanded = true;
      if (!processedPaths.has(path)) {
        processedPaths.add(path);
        initialExpanded = !shouldAutoCollapse(diff);
      }

      return { diff, initialExpanded };
    });
  }, [diffs, processedPaths]);

  const pathToIndex = useMemo(() => {
    const map = new Map<string, number>();
    diffItems.forEach(({ diff }, index) => {
      const path = diff.newPath || diff.oldPath || '';
      map.set(path, index);
    });
    return map;
  }, [diffItems]);

  const indexToPath = useCallback(
    (index: number): string | null => {
      const item = diffItems[index];
      if (!item) return null;
      return item.diff.newPath || item.diff.oldPath || null;
    },
    [diffItems]
  );

  const getTopFilePath = useCallback(
    (range: { startIndex: number; endIndex: number }): string | null => {
      const container = scrollContainerRef.current;
      if (!container) {
        return indexToPath(range.startIndex);
      }

      const containerTop = container.getBoundingClientRect().top;

      let bestPath: string | null = null;
      let bestTop = -Infinity;

      for (let i = range.startIndex; i <= range.endIndex; i++) {
        const path = indexToPath(i);
        if (!path) continue;

        const el = diffRefs.current.get(path);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        const relativeTop = rect.top - containerTop;
        const relativeBottom = rect.bottom - containerTop;

        const spansContainerTop = relativeTop <= 0 && relativeBottom > 0;

        if (spansContainerTop && relativeTop > bestTop) {
          bestTop = relativeTop;
          bestPath = path;
        }
      }

      return bestPath ?? indexToPath(range.startIndex);
    },
    [indexToPath]
  );

  const {
    fileInView: stateMachineFileInView,
    scrollToFile: stateMachineScrollToFile,
    onRangeChanged,
    onScrollComplete,
  } = useScrollSyncStateMachine({
    pathToIndex,
    indexToPath,
    getTopFilePath,
  });

  useEffect(() => {
    if (stateMachineFileInView !== null) {
      setFileInView(stateMachineFileInView);
    }
  }, [stateMachineFileInView, setFileInView]);

  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      visibleRangeRef.current = range;
      onRangeChanged(range);
    },
    [onRangeChanged]
  );

  const handleScrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      const index = stateMachineScrollToFile(path, lineNumber);
      if (index === null) return;

      changesPanelRef.current?.scrollToIndex(index, { align: 'start' });

      let retries = 0;
      const maxRetries = 3;

      function attemptComplete() {
        requestAnimationFrame(() => {
          const fileEl = diffRefs.current.get(path);
          if (fileEl) {
            if (lineNumber) {
              scrollToLineInDiff(fileEl, lineNumber, onScrollComplete);
            } else {
              onScrollComplete();
            }
            return;
          }

          retries++;
          if (retries < maxRetries) {
            attemptComplete();
          } else {
            onScrollComplete();
          }
        });
      }

      attemptComplete();
    },
    [stateMachineScrollToFile, onScrollComplete]
  );

  useEffect(() => {
    registerScrollToFile(handleScrollToFile);
    return () => registerScrollToFile(null);
  }, [registerScrollToFile, handleScrollToFile]);

  useEffect(() => {
    if (!selectedFilePath) return;

    const index = pathToIndex.get(selectedFilePath);
    if (index === undefined) return;

    const timeoutId = setTimeout(() => {
      changesPanelRef.current?.scrollToIndex(index, { align: 'start' });

      if (selectedLineNumber) {
        requestAnimationFrame(() => {
          const fileEl = diffRefs.current.get(selectedFilePath);
          if (fileEl) {
            scrollToLineInDiff(fileEl, selectedLineNumber);
          }
        });
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [selectedFilePath, selectedLineNumber, pathToIndex]);

  const handleDiffRef = useCallback(
    (path: string, el: HTMLDivElement | null) => {
      if (el) {
        diffRefs.current.set(path, el);
      } else {
        diffRefs.current.delete(path);
      }
    },
    []
  );

  const handleScrollerRef = useCallback((el: HTMLElement | Window | null) => {
    scrollContainerRef.current = el instanceof HTMLElement ? el : null;
  }, []);

  const renderDiffItem = useCallback(
    ({ diff, initialExpanded, workspaceId }: RenderDiffItemProps<Diff>) => (
      <PersistedDiffItem
        diff={diff}
        initialExpanded={initialExpanded ?? true}
        workspaceId={workspaceId}
      />
    ),
    []
  );

  return (
    <ChangesPanel
      ref={changesPanelRef}
      className={className}
      diffItems={diffItems}
      onDiffRef={handleDiffRef}
      onScrollerRef={handleScrollerRef}
      onRangeChanged={handleRangeChanged}
      renderDiffItem={renderDiffItem}
      workspaceId={workspaceId}
    />
  );
}
