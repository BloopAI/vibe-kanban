import { memo, useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { CaretDownIcon, CaretUpIcon, XIcon } from '@phosphor-icons/react';
import {
  ChangesPanel,
  type ChangesPanelHandle,
  type RenderDiffItemProps,
} from '@vibe/ui/components/ChangesPanel';
import { sortDiffs } from '@/shared/lib/fileTreeUtils';
import { useChangesView } from '@/shared/hooks/useChangesView';
import { useScrollSyncStateMachine } from '@/shared/hooks/useScrollSyncStateMachine';
import { usePersistedExpanded } from '@/shared/stores/useUiPreferencesStore';
import { useDiffs } from '@/shared/stores/useWorkspaceDiffStore';
import { PierreDiffCard } from './PierreDiffCard';
import type { Diff, DiffChangeKind } from 'shared/types';
import { usePanelFindShortcut } from '@/shared/hooks/usePanelFindShortcut';

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
  index,
  diff,
  initialExpanded,
  workspaceId,
  forceExpand,
  isMatched,
  isCurrentMatch,
  searchQuery,
  onVisibleMatchCountChange,
}: {
  index: number;
  diff: Diff;
  initialExpanded: boolean;
  workspaceId: string;
  forceExpand: boolean;
  isMatched: boolean;
  isCurrentMatch: boolean;
  searchQuery: string;
  onVisibleMatchCountChange?: (index: number, count: number) => void;
}) {
  const path = diff.newPath || diff.oldPath || '';
  const [expanded, toggle] = usePersistedExpanded(
    `diff:${path}`,
    initialExpanded
  );
  const effectiveExpanded = forceExpand || expanded;
  const handleToggle = useCallback(() => {
    if (forceExpand) return;
    toggle();
  }, [forceExpand, toggle]);

  return (
    <PierreDiffCard
      diff={diff}
      expanded={effectiveExpanded}
      onToggle={handleToggle}
      workspaceId={workspaceId}
      searchQuery={searchQuery}
      onVisibleMatchCountChange={
        onVisibleMatchCountChange
          ? (count) => onVisibleMatchCountChange(index, count)
          : undefined
      }
      className={
        isMatched
          ? isCurrentMatch
            ? 'border-l-2 border-brand/70 bg-brand/8'
            : 'border-l-2 border-brand/40 bg-brand/4'
          : ''
      }
    />
  );
});

export function ChangesPanelContainer({
  className,
  workspaceId,
}: ChangesPanelContainerProps) {
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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [visibleMatchCounts, setVisibleMatchCounts] = useState<
    Record<number, number>
  >({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const diffItems = useMemo(() => {
    return sortDiffs(diffs).map((diff) => {
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

  useEffect(() => {
    setVisibleMatchCounts({});
  }, [diffItems, searchQuery, showSearch]);

  const handleVisibleMatchCountChange = useCallback(
    (index: number, count: number) => {
      setVisibleMatchCounts((prev) => {
        if ((prev[index] ?? 0) === count) return prev;
        return { ...prev, [index]: count };
      });
    },
    []
  );

  const matchDiffIndices = useMemo(() => {
    const query = searchQuery.trim();
    if (!showSearch || query.length === 0) return [];

    const entries = Object.entries(visibleMatchCounts)
      .map(([key, count]) => [Number(key), count] as const)
      .filter(([idx, count]) => Number.isFinite(idx) && idx >= 0 && count > 0)
      .sort(([a], [b]) => a - b);

    const indices: number[] = [];
    for (const [idx, count] of entries) {
      for (let i = 0; i < count; i += 1) {
        indices.push(idx);
      }
    }
    return indices;
  }, [searchQuery, showSearch, visibleMatchCounts]);

  useEffect(() => {
    setCurrentMatchIdx(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matchDiffIndices.length === 0) return;
    if (currentMatchIdx < matchDiffIndices.length) return;
    setCurrentMatchIdx(0);
  }, [currentMatchIdx, matchDiffIndices.length]);

  const activeMatchIdx =
    matchDiffIndices.length === 0
      ? 0
      : Math.min(currentMatchIdx, matchDiffIndices.length - 1);
  const currentMatchIndex = matchDiffIndices[activeMatchIdx] ?? null;

  useEffect(() => {
    if (currentMatchIndex === null) return;
    changesPanelRef.current?.scrollToIndex(currentMatchIndex, {
      align: 'center',
    });
  }, [currentMatchIndex, searchQuery]);

  const matchedIndexSet = useMemo(() => {
    const set = new Set<number>();
    for (const idx of matchDiffIndices) {
      set.add(idx);
    }
    return set;
  }, [matchDiffIndices]);

  const handleNextMatch = useCallback(() => {
    if (matchDiffIndices.length === 0) return;
    setCurrentMatchIdx((prev) => (prev + 1) % matchDiffIndices.length);
  }, [matchDiffIndices.length]);

  const handlePrevMatch = useCallback(() => {
    if (matchDiffIndices.length === 0) return;
    setCurrentMatchIdx(
      (prev) => (prev - 1 + matchDiffIndices.length) % matchDiffIndices.length
    );
  }, [matchDiffIndices.length]);

  const closeSearch = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIdx(0);
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const focusSearchInput = useCallback(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearchState = useCallback(() => {
    setShowSearch(false);
    setSearchQuery('');
    setCurrentMatchIdx(0);
  }, []);

  usePanelFindShortcut({
    panel: 'diffs',
    otherPanel: 'conversation',
    panelRef,
    showSearch,
    setShowSearch,
    focusSearchInput,
    closeSearchState,
  });

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
    state: syncState,
    fileInView: stateMachineFileInView,
    scrollToFile: stateMachineScrollToFile,
    onRangeChanged,
    onScrollComplete,
  } = useScrollSyncStateMachine({
    pathToIndex,
    indexToPath,
    getTopFilePath,
  });

  // Keep a ref to syncState for the scroll listener (avoids stale closure)
  const syncStateRef = useRef(syncState);
  syncStateRef.current = syncState;

  useEffect(() => {
    if (stateMachineFileInView !== null) {
      setFileInView(stateMachineFileInView);
    }
  }, [stateMachineFileInView, setFileInView]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentState = syncStateRef.current;
      if (
        currentState === 'programmatic-scroll' ||
        currentState === 'sync-cooldown'
      ) {
        return;
      }

      const range = visibleRangeRef.current;
      const topPath = getTopFilePath(range);
      if (topPath !== null) {
        setFileInView(topPath);
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [getTopFilePath, setFileInView]);

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

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (lineNumber) {
            const fileEl = diffRefs.current.get(path);
            if (fileEl) {
              const selector = `[data-line="${lineNumber}"]`;
              const commentEl = fileEl.querySelector(selector);
              commentEl?.scrollIntoView({
                behavior: 'instant',
                block: 'center',
              });
            }
          }
          onScrollComplete();
        }, 100);
      });
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
        setTimeout(() => {
          const fileEl = diffRefs.current.get(selectedFilePath);
          if (fileEl) {
            const selector = `[data-line="${selectedLineNumber}"]`;
            const commentEl = fileEl.querySelector(selector);
            commentEl?.scrollIntoView({ behavior: 'instant', block: 'center' });
          }
        }, 100);
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
    ({
      index,
      diff,
      initialExpanded,
      workspaceId,
    }: RenderDiffItemProps<Diff>) => (
      <PersistedDiffItem
        index={index}
        diff={diff}
        initialExpanded={initialExpanded ?? true}
        workspaceId={workspaceId}
        forceExpand={matchedIndexSet.has(index)}
        isMatched={matchedIndexSet.has(index)}
        isCurrentMatch={
          currentMatchIndex !== null && index === currentMatchIndex
        }
        searchQuery={showSearch ? searchQuery : ''}
        onVisibleMatchCountChange={
          showSearch ? handleVisibleMatchCountChange : undefined
        }
      />
    ),
    [
      matchedIndexSet,
      currentMatchIndex,
      searchQuery,
      showSearch,
      handleVisibleMatchCountChange,
    ]
  );

  return (
    <div
      ref={panelRef}
      data-vk-search-panel="diffs"
      data-vk-search-open={showSearch ? 'true' : 'false'}
      tabIndex={-1}
      onMouseDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            'input, textarea, select, button, a, [contenteditable="true"]'
          )
        ) {
          return;
        }
        panelRef.current?.focus({ preventScroll: true });
      }}
      className="relative h-full"
    >
      {showSearch && (
        <div
          data-vk-search-ignore="true"
          className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-sm border border-border bg-secondary p-2 shadow-lg"
        >
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search diffs"
            className="w-[280px] rounded-sm border border-border bg-primary px-base py-half text-sm text-high placeholder:text-low focus:border-brand focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                  handlePrevMatch();
                } else {
                  handleNextMatch();
                }
              } else if (e.key === 'Escape') {
                e.preventDefault();
                closeSearch();
              }
            }}
          />
          <>
            <span className="w-12 text-right text-xs text-low whitespace-nowrap">
              {matchDiffIndices.length > 0
                ? `${activeMatchIdx + 1}/${matchDiffIndices.length}`
                : '0/0'}
            </span>
            <button
              type="button"
              onClick={handlePrevMatch}
              disabled={matchDiffIndices.length === 0}
              className="p-1 text-low hover:text-normal disabled:opacity-50 disabled:cursor-not-allowed"
              title="Previous match (Shift+Enter)"
            >
              <CaretUpIcon className="size-icon-sm" weight="bold" />
            </button>
            <button
              type="button"
              onClick={handleNextMatch}
              disabled={matchDiffIndices.length === 0}
              className="p-1 text-low hover:text-normal disabled:opacity-50 disabled:cursor-not-allowed"
              title="Next match (Enter)"
            >
              <CaretDownIcon className="size-icon-sm" weight="bold" />
            </button>
            <button
              type="button"
              onClick={closeSearch}
              className="p-1 text-low hover:text-normal"
              title="Close search (Escape)"
            >
              <XIcon className="size-icon-sm" weight="bold" />
            </button>
          </>
        </div>
      )}
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
    </div>
  );
}
