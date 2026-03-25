import type { ForwardedRef, ReactNode, RefAttributes } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '../lib/cn';

export interface ChangesPanelHandle {
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' }
  ) => void;
}

export interface ChangesPanelDiff {
  newPath?: string | null;
  oldPath?: string | null;
  additions?: number | null;
  deletions?: number | null;
}

export interface DiffItemData<
  TDiff extends ChangesPanelDiff = ChangesPanelDiff,
> {
  diff: TDiff;
  initialExpanded?: boolean;
}

export interface RenderDiffItemProps<
  TDiff extends ChangesPanelDiff = ChangesPanelDiff,
> {
  diff: TDiff;
  initialExpanded?: boolean;
  workspaceId: string;
}

export interface ChangesPanelProps<
  TDiff extends ChangesPanelDiff = ChangesPanelDiff,
> {
  className?: string;
  diffItems: DiffItemData<TDiff>[];
  renderDiffItem: (props: RenderDiffItemProps<TDiff>) => ReactNode;
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
  onMeasuredHeight?: (path: string, height: number) => void;
  onScrollerRef?: (ref: HTMLElement | Window | null) => void;
  onRangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  getMeasuredHeight?: (path: string) => number | undefined;
  getIsExpanded?: (path: string, initialExpanded?: boolean) => boolean;
  shouldSuppressSizeAdjustment?: () => boolean;
  workspaceId: string;
}

const HEADER_HEIGHT = 40;
const LINE_HEIGHT = 18;
const PADDING = 16;
const SPACING = 8;
const LARGE_DIFF_THRESHOLD = 1000;
const LARGE_DIFF_PLACEHOLDER_HEIGHT = 56;

function getDiffPath(diff: ChangesPanelDiff): string {
  return diff.newPath || diff.oldPath || '';
}

function estimateDiffHeight(
  diff: ChangesPanelDiff,
  isExpanded: boolean
): number {
  if (!isExpanded) {
    return HEADER_HEIGHT + SPACING;
  }

  const lineCount = (diff.additions ?? 0) + (diff.deletions ?? 0);

  if (lineCount > LARGE_DIFF_THRESHOLD) {
    return HEADER_HEIGHT + LARGE_DIFF_PLACEHOLDER_HEIGHT + SPACING;
  }

  const estimatedLines = Math.max(lineCount, 10);

  return HEADER_HEIGHT + estimatedLines * LINE_HEIGHT + PADDING + SPACING;
}

const ChangesPanelInner = <TDiff extends ChangesPanelDiff>(
  {
    className,
    diffItems,
    renderDiffItem,
    onDiffRef,
    onMeasuredHeight,
    onScrollerRef,
    onRangeChanged,
    getMeasuredHeight,
    getIsExpanded,
    shouldSuppressSizeAdjustment,
    workspaceId,
  }: ChangesPanelProps<TDiff>,
  ref: ForwardedRef<ChangesPanelHandle>
) => {
  const { t } = useTranslation(['tasks', 'common']);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevRangeRef = useRef({ startIndex: -1, endIndex: -1 });
  const diffRefCallbacksRef = useRef(
    new Map<string, (el: HTMLDivElement | null) => void>()
  );
  const virtualizer = useVirtualizer({
    count: diffItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const item = diffItems[index];
      if (!item) return HEADER_HEIGHT + SPACING;

      const path = getDiffPath(item.diff);
      const measuredHeight = getMeasuredHeight?.(path);
      if (measuredHeight !== undefined) {
        return measuredHeight;
      }

      const isExpanded =
        getIsExpanded?.(path, item.initialExpanded) ??
        item.initialExpanded ??
        true;

      return estimateDiffHeight(item.diff, isExpanded);
    },
    overscan: 10,
    paddingStart: SPACING,
    useFlushSync: false,
    useAnimationFrameWithResizeObserver: true,
    getItemKey: (index) => getDiffPath(diffItems[index]?.diff) || String(index),
    onChange: (instance) => {
      const range = instance.range;
      if (!range) return;
      const prev = prevRangeRef.current;
      if (
        range.startIndex === prev.startIndex &&
        range.endIndex === prev.endIndex
      ) {
        return; // Range unchanged — skip downstream work
      }
      prevRangeRef.current = {
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      };
      onRangeChanged?.({
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      });
    },
  });
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;

  // Suppress size-driven scroll adjustments during programmatic reveal
  useEffect(() => {
    virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (
      item,
      _delta,
      instance
    ) => {
      if (shouldSuppressSizeAdjustment?.()) {
        return false;
      }
      // Default: only adjust for items fully above the viewport
      const scrollOffset =
        scrollContainerRef.current?.scrollTop ?? instance.scrollOffset ?? 0;
      return item.end <= scrollOffset;
    };

    return () => {
      virtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined;
    };
  }, [shouldSuppressSizeAdjustment, virtualizer]);

  const measureElementRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        const path = element.dataset.path ?? null;
        const height = element.getBoundingClientRect().height;

        if (path) {
          onMeasuredHeight?.(path, height);
        }
      }
      virtualizerRef.current.measureElement(element);
    },
    [onMeasuredHeight]
  );

  useImperativeHandle(ref, () => ({
    scrollToIndex: (
      index: number,
      options?: { align?: 'start' | 'center' | 'end' }
    ) => {
      virtualizer.scrollToIndex(index, {
        align: options?.align ?? 'start',
        behavior: 'auto',
      });
    },
  }));

  const scrollerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      (
        scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>
      ).current = node;
      onScrollerRef?.(node);
    },
    [onScrollerRef]
  );

  if (diffItems.length === 0) {
    return (
      <div
        className={cn(
          'w-full h-full bg-secondary flex flex-col px-base',
          className
        )}
      >
        <div className="flex-1 flex items-center justify-center text-low">
          <p className="text-sm">{t('common:empty.noChanges')}</p>
        </div>
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : SPACING;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={scrollerRefCallback}
      className={cn(
        'w-full h-full bg-secondary overflow-auto px-base',
        className
      )}
      style={{ contain: 'layout style paint' }}
    >
      <div
        style={{
          paddingTop: `${paddingTop}px`,
          paddingBottom: `${paddingBottom}px`,
        }}
      >
        {virtualItems.map((virtualItem) => {
          const item = diffItems[virtualItem.index];
          if (!item) return null;
          const { diff, initialExpanded } = item;
          const path = getDiffPath(diff);
          let diffRefCallback = diffRefCallbacksRef.current.get(path);

          if (!diffRefCallback) {
            diffRefCallback = (el: HTMLDivElement | null) => {
              onDiffRef?.(path, el);
            };
            diffRefCallbacksRef.current.set(path, diffRefCallback);
          }

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              data-path={path}
              ref={measureElementRef}
            >
              <div ref={diffRefCallback}>
                {renderDiffItem({ diff, initialExpanded, workspaceId })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

type ChangesPanelComponent = <
  TDiff extends ChangesPanelDiff = ChangesPanelDiff,
>(
  props: ChangesPanelProps<TDiff> & RefAttributes<ChangesPanelHandle>
) => JSX.Element;

export const ChangesPanel = forwardRef(
  ChangesPanelInner
) as ChangesPanelComponent;
