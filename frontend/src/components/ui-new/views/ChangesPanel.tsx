import { memo, forwardRef, useImperativeHandle, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Virtuoso,
  VirtuosoHandle,
  ListRange,
  VirtuosoProps,
} from 'react-virtuoso';
import { usePersistedExpanded } from '@/stores/useUiPreferencesStore';
import { cn } from '@/lib/utils';
import { DiffViewCardWithComments } from '../containers/DiffViewCardWithComments';
import type { DiffInput } from '../containers/DiffViewCardWithComments';
import type { Diff } from 'shared/types';

export interface DiffItemData {
  diff: Diff;
  initialExpanded?: boolean;
}

export interface ChangesPanelHandle {
  scrollToIndex: (index: number) => void;
}

interface ChangesPanelContext {
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
  projectId: string;
  attemptId: string;
}

interface ChangesPanelProps {
  className?: string;
  diffItems: DiffItemData[];
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
  /** Callback when visible range changes - reports the first visible item index */
  onRangeChanged?: (range: ListRange) => void;
  /** Project ID for @ mentions in comments */
  projectId: string;
  /** Attempt ID for opening files in IDE */
  attemptId: string;
}

interface DiffItemProps {
  diff: Diff;
  initialExpanded?: boolean;
  onRef?: (path: string, el: HTMLDivElement | null) => void;
  projectId: string;
  attemptId: string;
}

const DiffItem = memo(function DiffItem({
  diff,
  initialExpanded = true,
  onRef,
  projectId,
  attemptId,
}: DiffItemProps) {
  const path = diff.newPath || diff.oldPath || '';
  const [expanded, toggle] = usePersistedExpanded(
    `diff:${path}`,
    initialExpanded
  );

  const input: DiffInput = {
    type: 'content',
    oldContent: diff.oldContent || '',
    newContent: diff.newContent || '',
    oldPath: diff.oldPath || undefined,
    newPath: diff.newPath || '',
    changeKind: diff.change,
  };

  return (
    <div ref={(el) => onRef?.(path, el)} className="pb-base">
      <DiffViewCardWithComments
        mode="collapsible"
        input={input}
        expanded={expanded}
        onToggle={toggle}
        className=""
        projectId={projectId}
        attemptId={attemptId}
      />
    </div>
  );
});

const ItemContent: VirtuosoProps<DiffItemData, ChangesPanelContext>['itemContent'] =
  (_index, { diff, initialExpanded }, { onDiffRef, projectId, attemptId }) => (
    <DiffItem
      diff={diff}
      initialExpanded={initialExpanded}
      onRef={onDiffRef}
      projectId={projectId}
      attemptId={attemptId}
    />
  );

const computeItemKey: VirtuosoProps<DiffItemData, ChangesPanelContext>['computeItemKey'] =
  (index, { diff }) => diff.newPath || diff.oldPath || String(index);

export const ChangesPanel = forwardRef<ChangesPanelHandle, ChangesPanelProps>(
  function ChangesPanel(
    { className, diffItems, onDiffRef, onRangeChanged, projectId, attemptId },
    ref
  ) {
    const { t } = useTranslation(['tasks', 'common']);
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    useImperativeHandle(ref, () => ({
      scrollToIndex: (index: number) => {
        virtuosoRef.current?.scrollToIndex({
          index,
          align: 'start',
          behavior: 'auto',
        });
      },
    }));

    const context = useMemo<ChangesPanelContext>(
      () => ({ onDiffRef, projectId, attemptId }),
      [onDiffRef, projectId, attemptId]
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
        className={cn('w-full h-full bg-secondary flex flex-col', className)}
      >
        <Virtuoso
          ref={virtuosoRef}
          data={diffItems}
          context={context}
          itemContent={ItemContent}
          computeItemKey={computeItemKey}
          rangeChanged={onRangeChanged}
          increaseViewportBy={{ top: 500, bottom: 500 }}
          className="px-base scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent"
          style={{ height: '100%' }}
        />
      </div>
    );
  }
);
