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

const PERF_DEBUG = true;
function perfLog(label: string, ...args: unknown[]) {
  if (!PERF_DEBUG) return;
  console.log(`%c[ChangesPanel] ${label}`, 'color: #4fc3f7', ...args);
}
function perfWarn(label: string, ...args: unknown[]) {
  if (!PERF_DEBUG) return;
  console.log(`[ChangesPanel] ${label}`, ...args);
}
function perfTime(label: string) {
  if (!PERF_DEBUG) return;
  performance.mark(`cp-${label}-start`);
}
function perfTimeEnd(label: string) {
  if (!PERF_DEBUG) return;
  performance.mark(`cp-${label}-end`);
  const measure = performance.measure(
    `cp-${label}`,
    `cp-${label}-start`,
    `cp-${label}-end`
  );
  const ms = measure.duration.toFixed(2);
  if (measure.duration > 16) {
    perfWarn(`${label}: ${ms}ms (>16ms FRAME DROP)`);
  } else {
    perfLog(`${label}: ${ms}ms`);
  }
}

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
  onScrollerRef?: (ref: HTMLElement | Window | null) => void;
  onRangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  workspaceId: string;
}

const HEADER_HEIGHT = 48;
const LINE_HEIGHT = 20;
const PADDING = 16;
const SPACING = 8;

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
  const estimatedLines = Math.max(lineCount * 1.2, 10);

  return HEADER_HEIGHT + estimatedLines * LINE_HEIGHT + PADDING + SPACING;
}

const ChangesPanelInner = <TDiff extends ChangesPanelDiff>(
  {
    className,
    diffItems,
    renderDiffItem,
    onDiffRef,
    onScrollerRef,
    onRangeChanged,
    workspaceId,
  }: ChangesPanelProps<TDiff>,
  ref: ForwardedRef<ChangesPanelHandle>
) => {
  const { t } = useTranslation(['tasks', 'common']);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevRangeRef = useRef({ startIndex: -1, endIndex: -1 });
  const renderCountRef = useRef(0);
  renderCountRef.current++;
  perfTime('render');

  useEffect(() => {
    perfTimeEnd('render');
    perfLog(
      `render #${renderCountRef.current}`,
      `items=${diffItems.length}`,
    );
  });

  const virtualizer = useVirtualizer({
    count: diffItems.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) =>
      estimateDiffHeight(
        diffItems[index]?.diff,
        diffItems[index]?.initialExpanded ?? true
      ),
    overscan: 2,
    paddingStart: SPACING,
    useFlushSync: false,
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
      perfLog(
        'virtualizer.onChange',
        `range=[${range.startIndex}..${range.endIndex}]`,
        `totalSize=${instance.getTotalSize()}`,
        `virtualItems=${instance.getVirtualItems().length}`
      );
      onRangeChanged?.({
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      });
    },
  });

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
  const paddingTop =
    virtualItems.length > 0 ? virtualItems[0].start : SPACING;
  const paddingBottom =
    virtualItems.length > 0
      ? virtualizer.getTotalSize() -
        virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={scrollerRefCallback}
      className={cn(
        'w-full h-full bg-secondary overflow-auto px-base',
        className
      )}
      style={{ contain: 'layout style paint', willChange: 'transform' }}
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
          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              <div ref={(el) => onDiffRef?.(path, el)}>
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
