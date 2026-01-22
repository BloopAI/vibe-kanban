import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { ListRange } from 'react-virtuoso';
import {
  ChangesPanel,
  type ChangesPanelHandle,
} from '../views/ChangesPanel';
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

// Auto-collapse defaults based on change type (matches DiffsPanel behavior)
const COLLAPSE_BY_CHANGE_TYPE: Record<DiffChangeKind, boolean> = {
  added: false, // Expand added files
  deleted: true, // Collapse deleted files
  modified: false, // Expand modified files
  renamed: true, // Collapse renamed files
  copied: true, // Collapse copied files
  permissionChange: true, // Collapse permission changes
};

const COLLAPSE_MAX_LINES = 200;
const SCROLL_TARGET_TOP_EPSILON_PX = 24;
const FILE_IN_VIEW_STABLE_MS = 80;
const PREFETCH_BUFFER = 4;
const PREFETCH_RANGE_DELAY_MS = 120;
const PREFETCH_MAX_LINES = 1000;
const USER_SCROLL_OVERRIDE_WINDOW_MS = 400;

function shouldAutoCollapse(diff: Diff): boolean {
  if (COLLAPSE_BY_CHANGE_TYPE[diff.change]) {
    return true;
  }

  const totalLines = (diff.additions ?? 0) + (diff.deletions ?? 0);
  if (totalLines > COLLAPSE_MAX_LINES) {
    return true;
  }

  return false;
}

interface ChangesPanelContainerProps {
  className: string;
  /** Attempt ID for opening files in IDE */
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
  const {
    selectedFilePath,
    selectedLineNumber,
    setFileInView,
    getScrollTarget,
    clearScrollLock,
  } = useChangesView();
  const panelRef = useRef<ChangesPanelHandle>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const scrollerCleanupRef = useRef<(() => void) | null>(null);
  const diffRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [processedPaths] = useState(() => new Set<string>());
  const [isScrolling, setIsScrolling] = useState(false);
  const prefetchRangeRef = useRef<ListRange | null>(null);
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const candidatePublishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastUserScrollAtRef = useRef(0);
  const scrollTargetSetAtRef = useRef(0);
  const lastCandidateRef = useRef<string | null>(null);
  const lastPublishedRef = useRef<string | null>(null);
  const freezePathRef = useRef<string | null>(null);

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

  const defaultItemHeight = useMemo(() => {
    if (diffs.length === 0) return 240;
    const estimates = diffs
      .map((diff) => {
        const lineCount = estimateDiffLineCount(
          diff.additions,
          diff.deletions
        );
        return estimateDiffItemHeightPx(lineCount);
      })
      .sort((a, b) => a - b);
    const median = estimates[Math.floor(estimates.length / 2)];
    return Math.max(median, 240);
  }, [diffs]);

  const clearCandidatePublishTimer = useCallback(() => {
    if (candidatePublishTimeoutRef.current) {
      clearTimeout(candidatePublishTimeoutRef.current);
      candidatePublishTimeoutRef.current = null;
    }
  }, []);

  const publishFileInView = useCallback(
    (path: string) => {
      if (lastPublishedRef.current !== path) {
        lastPublishedRef.current = path;
        setFileInView(path);
      }
    },
    [setFileInView]
  );

  const scheduleCandidatePublish = useCallback(
    (path: string) => {
      clearCandidatePublishTimer();
      candidatePublishTimeoutRef.current = setTimeout(() => {
        if (lastCandidateRef.current !== path) return;
        if (getScrollTarget() !== null) return;
        if (freezePathRef.current) return;
        publishFileInView(path);
      }, FILE_IN_VIEW_STABLE_MS);
    },
    [clearCandidatePublishTimer, getScrollTarget, publishFileInView]
  );

  const handleIsScrolling = useCallback((next: boolean) => {
    setIsScrolling((prev) => (prev === next ? prev : next));
  }, []);

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
        const oldLang =
          getHighLightLanguageFromPath(oldPath) || 'plaintext';
        const newLang =
          getHighLightLanguageFromPath(newPath) || 'plaintext';

        prefetchDiff({
          oldFileName: oldPath,
          oldContent,
          newFileName: newPath,
          newContent,
          oldLang,
          newLang,
          theme: actualTheme,
        });
      }
    },
    [diffItems, actualTheme]
  );

  const schedulePrefetch = useCallback(
    (range: ListRange) => {
      prefetchRangeRef.current = range;
      if (prefetchTimeoutRef.current) return;

      prefetchTimeoutRef.current = setTimeout(() => {
        const pendingRange = prefetchRangeRef.current;
        prefetchTimeoutRef.current = null;
        if (!pendingRange) return;
        prefetchDiffsForRange(pendingRange);
      }, PREFETCH_RANGE_DELAY_MS);
    },
    [prefetchDiffsForRange]
  );

  useEffect(() => {
    if (!selectedFilePath) return;

    const index = pathToIndex.get(selectedFilePath);
    if (index === undefined) return;

    clearCandidatePublishTimer();

    const timeoutId = setTimeout(() => {
      scrollTargetSetAtRef.current = Date.now();
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
  }, [selectedFilePath, selectedLineNumber, pathToIndex, clearCandidatePublishTimer]);

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

  const handleScrollerRef = useCallback(
    (node: HTMLElement | null | Window) => {
      const element = node instanceof HTMLElement ? node : null;
      if (scrollerRef.current === element) return;

      if (scrollerCleanupRef.current) {
        scrollerCleanupRef.current();
        scrollerCleanupRef.current = null;
      }

      scrollerRef.current = element;
      if (!element) return;

      const markUserScroll = () => {
        lastUserScrollAtRef.current = Date.now();
      };

      element.addEventListener('wheel', markUserScroll, { passive: true });
      element.addEventListener('touchmove', markUserScroll, { passive: true });

      scrollerCleanupRef.current = () => {
        element.removeEventListener('wheel', markUserScroll);
        element.removeEventListener('touchmove', markUserScroll);
      };
    },
    []
  );

  const getPathTopDelta = useCallback((path: string) => {
    const scroller = scrollerRef.current;
    const el = diffRefs.current.get(path);
    if (!scroller || !el) return null;
    const scrollerRect = scroller.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.bottom <= scrollerRect.top || rect.top >= scrollerRect.bottom) {
      return null;
    }
    return rect.top - scrollerRect.top;
  }, []);

  // Use DOM geometry to find the visible diff closest to the viewport top.
  const getClosestPathToTop = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return null;

    const scrollerRect = scroller.getBoundingClientRect();
    let bestPath: string | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    let fallbackPath: string | null = null;
    let fallbackAbsDelta = Number.POSITIVE_INFINITY;

    diffRefs.current.forEach((el, path) => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom <= scrollerRect.top || rect.top >= scrollerRect.bottom) {
        return;
      }

      const delta = rect.top - scrollerRect.top;
      if (Math.abs(delta) < fallbackAbsDelta) {
        fallbackAbsDelta = Math.abs(delta);
        fallbackPath = path;
      }

      if (delta >= -SCROLL_TARGET_TOP_EPSILON_PX && delta < bestDelta) {
        bestDelta = delta;
        bestPath = path;
      }
    });

    return bestPath ?? fallbackPath;
  }, []);

  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current);
        prefetchTimeoutRef.current = null;
      }
      clearCandidatePublishTimer();
      if (scrollerCleanupRef.current) {
        scrollerCleanupRef.current();
        scrollerCleanupRef.current = null;
      }
    };
  }, []);

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      const scrollTarget = getScrollTarget();
      const candidatePath = getClosestPathToTop();
      const fallbackPath = candidatePath
        ? null
        : (() => {
            const item = diffItems[range.startIndex];
            if (!item) return null;
            return item.diff.newPath || item.diff.oldPath || null;
          })();
      const resolvedPath = candidatePath ?? fallbackPath;
      schedulePrefetch(range);

      if (!resolvedPath) return;

      if (scrollTarget !== null) {
        const targetDelta = getPathTopDelta(scrollTarget);
        const isTargetAligned =
          targetDelta !== null &&
          Math.abs(targetDelta) <= SCROLL_TARGET_TOP_EPSILON_PX;
        const userOverride =
          lastUserScrollAtRef.current >
          scrollTargetSetAtRef.current + USER_SCROLL_OVERRIDE_WINDOW_MS;
        if (candidatePath === scrollTarget || isTargetAligned) {
          clearScrollLock();
          scrollTargetSetAtRef.current = 0;
          freezePathRef.current = scrollTarget;
          publishFileInView(scrollTarget);
        } else if (userOverride) {
          clearScrollLock();
          scrollTargetSetAtRef.current = 0;
        } else {
          return;
        }
      }

      if (scrollTarget === null && freezePathRef.current) {
        const freezeDelta = getPathTopDelta(freezePathRef.current);
        const isFreezeAligned =
          freezeDelta !== null &&
          Math.abs(freezeDelta) <= SCROLL_TARGET_TOP_EPSILON_PX;
        if (isFreezeAligned) {
          publishFileInView(freezePathRef.current);
          return;
        }

        freezePathRef.current = null;
      }

      if (resolvedPath !== lastCandidateRef.current) {
        lastCandidateRef.current = resolvedPath;
        if (lastPublishedRef.current === null) {
          publishFileInView(resolvedPath);
          return;
        }
        scheduleCandidatePublish(resolvedPath);
      }
    },
    [
      diffItems,
      getScrollTarget,
      clearScrollLock,
      getPathTopDelta,
      getClosestPathToTop,
      schedulePrefetch,
      publishFileInView,
      scheduleCandidatePublish,
    ]
  );

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
