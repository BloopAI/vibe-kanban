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
import { useUiPreferencesStore } from '@/shared/stores/useUiPreferencesStore';
import { useFileInViewStore } from '@/shared/stores/useFileInViewStore';
import { preloadHighlighter } from '@pierre/diffs';
import { PierreDiffCard } from './PierreDiffCard';
import type { Diff, DiffChangeKind } from 'shared/types';

let highlighterPreloaded = false;
function ensureHighlighterPreloaded() {
  if (highlighterPreloaded) return;
  highlighterPreloaded = true;
  preloadHighlighter({
    themes: ['github-dark', 'github-light'],
    langs: [],
  });
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
      lineEl.scrollIntoView({ behavior: 'instant', block: 'nearest' });
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
const COLLAPSED_ROW_HEIGHT = 48;
const REVEAL_ALIGNMENT_TOLERANCE = 2;
const REQUIRED_STABLE_FRAMES = 3;
const MAX_REVEAL_DURATION_MS = 2000;

function shouldAutoCollapse(diff: Diff): boolean {
  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);

  // For renamed files, only collapse if there are no content changes
  // OR if the diff is large
  if (diff.change === 'renamed') {
    return totalLines === 0 || totalLines > COLLAPSE_MAX_LINES;
  }

  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }

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
  onExpandedBodyReadyChange,
  workspaceId,
}: {
  diff: Diff;
  initialExpanded: boolean;
  onExpandedBodyReadyChange?: (path: string, ready: boolean) => void;
  workspaceId: string;
}) {
  const path = diff.newPath || diff.oldPath || '';
  const key = `diff:${path}`;
  const expanded = useUiPreferencesStore(
    (s) => s.expanded[key] ?? initialExpanded
  );
  const toggle = () => {
    useUiPreferencesStore.getState().toggleExpanded(key, initialExpanded);
  };

  return (
    <PierreDiffCard
      diff={diff}
      expanded={expanded}
      onToggle={toggle}
      onExpandedBodyReadyChange={(ready) =>
        onExpandedBodyReadyChange?.(path, ready)
      }
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
  const { registerScrollToFile } = useChangesView();
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const changesPanelRef = useRef<ChangesPanelHandle>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const revealRequestIdRef = useRef(0);
  const revealStartTimeRef = useRef<number>(0);
  const expandedBodyReadyRef = useRef<Map<string, boolean>>(new Map());
  const measuredHeightCacheRef = useRef<Map<string, number>>(new Map());
  const handleScrollToFileRef = useRef<
    (path: string, lineNumber?: number) => void
  >(() => {});
  const visibleRangeRef = useRef<{ startIndex: number; endIndex: number }>({
    startIndex: 0,
    endIndex: 0,
  });
  const [processedPaths] = useState(() => new Set<string>());

  const diffItems = useMemo(() => {
    const sorted = sortDiffs(diffs);
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

  // Throttle fileInView writes to Zustand via rAF to avoid layout thrashing
  const rafRef = useRef<number | null>(null);
  const onFileInViewChanged = useCallback((path: string | null) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      useFileInViewStore.getState().setFileInView(path);
    });
  }, []);

  const {
    scrollToFile: stateMachineScrollToFile,
    onRangeChanged,
    onScrollComplete,
  } = useScrollSyncStateMachine({
    pathToIndex,
    indexToPath,
    onFileInViewChanged,
  });

  const handleRangeChanged = useCallback(
    (range: { startIndex: number; endIndex: number }) => {
      visibleRangeRef.current = range;
      onRangeChanged(range);
    },
    [onRangeChanged]
  );

  const shouldSuppressSizeAdjustment = useCallback(() => {
    return (
      revealRequestIdRef.current > 0 &&
      performance.now() - (revealStartTimeRef.current ?? 0) <
        MAX_REVEAL_DURATION_MS
    );
  }, []);

  const handleScrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      const requestId = revealRequestIdRef.current + 1;
      revealRequestIdRef.current = requestId;
      revealStartTimeRef.current = performance.now();

      const expandedKey = `diff:${path}`;
      const expandedState = useUiPreferencesStore.getState().expanded;
      if (!(expandedState[expandedKey] ?? false)) {
        useUiPreferencesStore.getState().setExpanded(expandedKey, true);
      }

      const targetIndex = stateMachineScrollToFile(path, lineNumber);
      if (targetIndex === null) {
        return;
      }
      const scrollIdx: number = targetIndex;
      const revealStartTime = performance.now();
      let stableFrames = 0;

      const getRevealState = () => {
        const scrollEl = scrollContainerRef.current;
        const fileEl = diffRefs.current.get(path);
        if (!scrollEl || !fileEl) return null;

        const rect = fileEl.getBoundingClientRect();
        const delta = rect.top - scrollEl.getBoundingClientRect().top;
        const height = rect.height;

        return { scrollEl, fileEl, delta, height };
      };

      const isExpandedInStore = () => {
        return useUiPreferencesStore.getState().expanded[expandedKey] ?? false;
      };

      const alignTargetToTop = () => {
        const revealState = getRevealState();
        if (!revealState) return null;

        if (Math.abs(revealState.delta) > REVEAL_ALIGNMENT_TOLERANCE) {
          revealState.scrollEl.scrollTop += revealState.delta;
          stableFrames = 0;
        }

        if (isExpandedInStore() && revealState.height <= COLLAPSED_ROW_HEIGHT) {
          stableFrames = 0;
        } else if (Math.abs(revealState.delta) <= REVEAL_ALIGNMENT_TOLERANCE) {
          stableFrames += 1;
        }

        return revealState;
      };

      const isExpandedBodyReady = () => {
        return expandedBodyReadyRef.current.get(path) ?? false;
      };

      changesPanelRef.current?.scrollToIndex(scrollIdx, { align: 'start' });

      let attempts = 0;

      function attemptReveal() {
        requestAnimationFrame(() => {
          if (revealRequestIdRef.current !== requestId) {
            return;
          }

          alignTargetToTop();

          if (
            getRevealState() &&
            stableFrames >= REQUIRED_STABLE_FRAMES &&
            isExpandedBodyReady()
          ) {
            requestAnimationFrame(() => {
              if (revealRequestIdRef.current !== requestId) {
                return;
              }

              if (lineNumber) {
                requestAnimationFrame(() => {
                  if (revealRequestIdRef.current !== requestId) {
                    return;
                  }

                  const revealState = getRevealState();
                  if (revealState) {
                    scrollToLineInDiff(
                      revealState.fileEl,
                      lineNumber,
                      onScrollComplete
                    );
                  } else {
                    onScrollComplete();
                  }
                });
              } else {
                onScrollComplete();
              }
            });
            return;
          }

          attempts++;
          if (performance.now() - revealStartTime < MAX_REVEAL_DURATION_MS) {
            attemptReveal();
          } else {
            onScrollComplete();
          }
        });
      }

      attemptReveal();
    },
    [stateMachineScrollToFile, onScrollComplete]
  );

  handleScrollToFileRef.current = handleScrollToFile;

  const registeredScrollToFile = useCallback(
    (path: string, lineNumber?: number) => {
      handleScrollToFileRef.current(path, lineNumber);
    },
    []
  );

  useEffect(() => {
    registerScrollToFile(registeredScrollToFile);
    return () => {
      registerScrollToFile(null);
    };
  }, [registerScrollToFile, registeredScrollToFile]);

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

  const handleExpandedBodyReadyChange = useCallback(
    (path: string, ready: boolean) => {
      expandedBodyReadyRef.current.set(path, ready);
    },
    []
  );

  const handleMeasuredHeight = useCallback((path: string, height: number) => {
    measuredHeightCacheRef.current.set(path, height);
  }, []);

  const getMeasuredHeight = useCallback((path: string): number | undefined => {
    return measuredHeightCacheRef.current.get(path);
  }, []);

  const handleScrollerRef = useCallback((el: HTMLElement | Window | null) => {
    scrollContainerRef.current = el instanceof HTMLElement ? el : null;
  }, []);

  const renderDiffItem = useCallback(
    ({ diff, initialExpanded, workspaceId }: RenderDiffItemProps<Diff>) => (
      <PersistedDiffItem
        diff={diff}
        initialExpanded={initialExpanded ?? true}
        onExpandedBodyReadyChange={handleExpandedBodyReadyChange}
        workspaceId={workspaceId}
      />
    ),
    [handleExpandedBodyReadyChange]
  );

  return (
    <ChangesPanel
      ref={changesPanelRef}
      className={className}
      diffItems={diffItems}
      getIsExpanded={(path, initialExpanded) =>
        useUiPreferencesStore.getState().expanded[`diff:${path}`] ??
        initialExpanded ??
        true
      }
      onDiffRef={handleDiffRef}
      onMeasuredHeight={handleMeasuredHeight}
      getMeasuredHeight={getMeasuredHeight}
      shouldSuppressSizeAdjustment={shouldSuppressSizeAdjustment}
      onScrollerRef={handleScrollerRef}
      onRangeChanged={handleRangeChanged}
      renderDiffItem={renderDiffItem}
      workspaceId={workspaceId}
    />
  );
}
