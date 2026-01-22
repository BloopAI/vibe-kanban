import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { ListRange } from 'react-virtuoso';
import { ChangesPanel, type ChangesPanelHandle } from '../views/ChangesPanel';
import { sortDiffs } from '@/utils/fileTreeUtils';
import {
  estimateDiffItemHeightPx,
  estimateDiffLineCount,
} from '@/utils/diffHeightEstimate';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { getHighLightLanguageFromPath } from '@/utils/extToLanguage';
import { useChangesView } from '@/contexts/ChangesViewContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useTask } from '@/hooks/useTask';
import { prefetchDiff } from '@/hooks/useDiffWorker';
import type { Diff, DiffChangeKind } from 'shared/types';

const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false,
  deleted: true,
  modified: false,
  renamed: true,
  copied: true,
  permissionChange: true,
};

const COLLAPSE_MAX_LINES = 200;
const SCROLL_TARGET_TOP_EPSILON_PX = 50;
const FILE_IN_VIEW_DEBOUNCE_MS = 150;
const PREFETCH_BUFFER = 4;
const PREFETCH_RANGE_DELAY_MS = 120;
const PREFETCH_MAX_LINES = 1000;

function shouldAutoCollapse(diff: Diff): boolean {
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }
  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);
  return totalLines > COLLAPSE_MAX_LINES;
}

interface ChangesPanelContainerProps {
  className: string;
  attemptId: string;
}

export function ChangesPanelContainer({
  className,
  attemptId,
}: ChangesPanelContainerProps) {
  const { diffs, workspace } = useWorkspaceContext();
  const { theme } = useTheme();
  const actualTheme = getActualTheme(theme);
  const { data: task } = useTask(workspace?.task_id, {
    enabled: !!workspace?.task_id,
  });

  const { selectedFilePath, selectedLineNumber, setFileInView, unlockScroll } =
    useChangesView();

  const panelRef = useRef<ChangesPanelHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [processedPaths] = useState(() => new Set<string>());
  const [isScrolling, setIsScrolling] = useState(false);

  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInViewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pendingFileInViewRef = useRef<string | null>(null);

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
      if (path) map.set(path, index);
    });
    return map;
  }, [diffItems]);

  const indexToPath = useMemo(() => {
    return diffItems.map(({ diff }) => diff.newPath || diff.oldPath || '');
  }, [diffItems]);

  const defaultItemHeight = useMemo(() => {
    if (diffs.length === 0) return 240;
    const estimates = diffs
      .map((diff) => {
        const lineCount = estimateDiffLineCount(diff.additions, diff.deletions);
        return estimateDiffItemHeightPx(lineCount);
      })
      .sort((a, b) => a - b);
    const median = estimates[Math.floor(estimates.length / 2)];
    return Math.max(median, 240);
  }, [diffs]);

  const prefetchDiffsForRange = useCallback(
    (range: ListRange) => {
      if (diffItems.length === 0) return;
      const start = Math.max(0, range.startIndex - PREFETCH_BUFFER);
      const end = Math.min(
        diffItems.length - 1,
        range.endIndex + PREFETCH_BUFFER
      );

      for (let i = start; i <= end; i += 1) {
        const item = diffItems[i];
        if (!item || item.initialExpanded === false) continue;
        const diff = item.diff;
        const oldContent = diff.oldContent ?? '';
        const newContent = diff.newContent ?? '';
        if (!oldContent && !newContent) continue;
        if (oldContent === newContent) continue;
        const lineCount = (diff.additions ?? 0) + (diff.deletions ?? 0);
        if (lineCount > PREFETCH_MAX_LINES) continue;

        const filePath = diff.newPath || diff.oldPath || 'unknown';
        const oldPath = diff.oldPath || filePath;
        const newPath = diff.newPath || filePath;
        prefetchDiff({
          oldFileName: oldPath,
          oldContent,
          newFileName: newPath,
          newContent,
          oldLang: getHighLightLanguageFromPath(oldPath) || 'plaintext',
          newLang: getHighLightLanguageFromPath(newPath) || 'plaintext',
          theme: actualTheme,
        });
      }
    },
    [diffItems, actualTheme]
  );

  const schedulePrefetch = useCallback(
    (range: ListRange) => {
      if (prefetchTimeoutRef.current) return;
      prefetchTimeoutRef.current = setTimeout(() => {
        prefetchTimeoutRef.current = null;
        prefetchDiffsForRange(range);
      }, PREFETCH_RANGE_DELAY_MS);
    },
    [prefetchDiffsForRange]
  );

  const getFileAtViewportTop = useCallback(
    (range: ListRange): string | null => {
      const scroller = scrollerRef.current;
      if (!scroller) return null;

      const scrollerRect = scroller.getBoundingClientRect();
      let bestPath: string | null = null;
      let bestDelta = Number.POSITIVE_INFINITY;

      const start = Math.max(0, range.startIndex);
      const end = Math.min(range.endIndex, indexToPath.length - 1);

      for (let i = start; i <= end; i += 1) {
        const path = indexToPath[i];
        if (!path) continue;
        const el = diffRefs.current.get(path);
        if (!el) continue;

        const rect = el.getBoundingClientRect();
        if (
          rect.bottom <= scrollerRect.top ||
          rect.top >= scrollerRect.bottom
        ) {
          continue;
        }

        const delta = rect.top - scrollerRect.top;
        if (delta >= -SCROLL_TARGET_TOP_EPSILON_PX && delta < bestDelta) {
          bestDelta = delta;
          bestPath = path;
        }
      }

      return bestPath || indexToPath[start] || null;
    },
    [indexToPath]
  );

  const debouncedSetFileInView = useCallback(
    (path: string) => {
      pendingFileInViewRef.current = path;

      if (fileInViewDebounceRef.current) {
        clearTimeout(fileInViewDebounceRef.current);
      }

      fileInViewDebounceRef.current = setTimeout(() => {
        fileInViewDebounceRef.current = null;
        const pending = pendingFileInViewRef.current;
        if (pending) {
          setFileInView(pending);
        }
      }, FILE_IN_VIEW_DEBOUNCE_MS);
    },
    [setFileInView]
  );

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      schedulePrefetch(range);
      const pathAtTop = getFileAtViewportTop(range);
      if (pathAtTop) {
        debouncedSetFileInView(pathAtTop);
      }
    },
    [schedulePrefetch, getFileAtViewportTop, debouncedSetFileInView]
  );

  const handleScrollerRef = useCallback(
    (node: HTMLElement | null | Window) => {
      const element = node instanceof HTMLElement ? node : null;
      scrollerRef.current = element;

      if (!element) return;

      const handleUserScroll = () => {
        unlockScroll();
      };

      element.addEventListener('wheel', handleUserScroll, { passive: true });
      element.addEventListener('touchstart', handleUserScroll, {
        passive: true,
      });

      return () => {
        element.removeEventListener('wheel', handleUserScroll);
        element.removeEventListener('touchstart', handleUserScroll);
      };
    },
    [unlockScroll]
  );

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

  const handleIsScrolling = useCallback((next: boolean) => {
    setIsScrolling((prev) => (prev === next ? prev : next));
  }, []);

  useEffect(() => {
    if (!selectedFilePath) return;

    const index = pathToIndex.get(selectedFilePath);
    if (index === undefined) return;

    if (fileInViewDebounceRef.current) {
      clearTimeout(fileInViewDebounceRef.current);
      fileInViewDebounceRef.current = null;
    }

    const timeoutId = setTimeout(() => {
      panelRef.current?.scrollToIndex(index);

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

  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current) clearTimeout(prefetchTimeoutRef.current);
      if (fileInViewDebounceRef.current)
        clearTimeout(fileInViewDebounceRef.current);
    };
  }, []);

  const projectId = task?.project_id;
  if (!projectId) {
    return (
      <ChangesPanel
        ref={panelRef}
        className={className}
        diffItems={[]}
        defaultItemHeight={defaultItemHeight}
        projectId=""
        attemptId={attemptId}
      />
    );
  }

  return (
    <ChangesPanel
      ref={panelRef}
      className={className}
      diffItems={diffItems}
      defaultItemHeight={defaultItemHeight}
      isScrolling={isScrolling}
      onIsScrolling={handleIsScrolling}
      onDiffRef={handleDiffRef}
      onRangeChanged={handleRangeChanged}
      onScrollerRef={handleScrollerRef}
      projectId={projectId}
      attemptId={attemptId}
    />
  );
}
