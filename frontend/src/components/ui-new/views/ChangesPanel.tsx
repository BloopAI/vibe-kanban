import { memo, forwardRef, useRef, useImperativeHandle, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, VirtuosoHandle, ListRange } from 'react-virtuoso';
import { usePersistedExpanded } from '@/stores/useUiPreferencesStore';
import { cn } from '@/lib/utils';
import { PierreDiffCard } from '../containers/PierreDiffCard';
import { calculateDefaultHeight } from '@/utils/diffHeightEstimate';
import type { Diff } from 'shared/types';

export interface ChangesPanelHandle {
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' }
  ) => void;
}

interface DiffItemData {
  diff: Diff;
  initialExpanded?: boolean;
}

interface ChangesPanelProps {
  className?: string;
  diffItems: DiffItemData[];
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
  /** Callback for Virtuoso's scroll container ref */
  onScrollerRef?: (ref: HTMLElement | Window | null) => void;
  /** Callback when visible range changes (for scroll sync) */
  onRangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  /** Attempt ID for opening files in IDE */
  attemptId: string;
}

const DiffItem = memo(function DiffItem({
  diff,
  initialExpanded = true,
  onRef,
  attemptId,
}: {
  diff: Diff;
  initialExpanded?: boolean;
  onRef?: (path: string, el: HTMLDivElement | null) => void;
  attemptId: string;
}) {
  const path = diff.newPath || diff.oldPath || '';
  const [expanded, toggle] = usePersistedExpanded(
    `diff:${path}`,
    initialExpanded
  );

  return (
    <div ref={(el) => onRef?.(path, el)}>
      <PierreDiffCard
        diff={diff}
        expanded={expanded}
        onToggle={toggle}
        attemptId={attemptId}
        className=""
      />
    </div>
  );
});

export const ChangesPanel = forwardRef<ChangesPanelHandle, ChangesPanelProps>(
  function ChangesPanel(
    {
      className,
      diffItems,
      onDiffRef,
      onScrollerRef,
      onRangeChanged,
      attemptId,
    },
    ref
  ) {
    const { t } = useTranslation(['tasks', 'common']);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    useImperativeHandle(ref, () => ({
      scrollToIndex: (
        index: number,
        options?: { align?: 'start' | 'center' | 'end' }
      ) => {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: options?.align ?? 'start',
          behavior: 'auto',
        });
      },
    }));

    const handleRangeChanged = (range: ListRange) => {
      onRangeChanged?.({
        startIndex: range.startIndex,
        endIndex: range.endIndex,
      });
    };

    const defaultItemHeight = useMemo(
      () => calculateDefaultHeight(diffItems.map((item) => item.diff)),
      [diffItems]
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

    return (
      <div
        className={cn(
          'w-full h-full bg-secondary flex flex-col px-base',
          className
        )}
      >
        <Virtuoso
          ref={virtuosoRef}
          scrollerRef={onScrollerRef}
          data={diffItems}
          defaultItemHeight={defaultItemHeight}
          components={{
            Header: () => <div className="h-base" />,
          }}
          itemContent={(_index, { diff, initialExpanded }) => (
            <div>
              <DiffItem
                diff={diff}
                initialExpanded={initialExpanded}
                onRef={onDiffRef}
                attemptId={attemptId}
              />
            </div>
          )}
          computeItemKey={(index, { diff }) =>
            diff.newPath || diff.oldPath || String(index)
          }
          rangeChanged={handleRangeChanged}
          increaseViewportBy={{ top: 500, bottom: 300 }}
        />
      </div>
    );
  }
);
