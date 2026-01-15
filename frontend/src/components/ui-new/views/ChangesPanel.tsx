import { memo, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePersistedExpanded } from '@/stores/useUiPreferencesStore';
import { cn } from '@/lib/utils';
import { DiffViewCardWithComments } from '../containers/DiffViewCardWithComments';
import type { DiffInput } from '../containers/DiffViewCardWithComments';
import type { Diff } from 'shared/types';

interface DiffItemData {
  diff: Diff;
  initialExpanded?: boolean;
}

interface ChangesPanelProps {
  className?: string;
  diffItems: DiffItemData[];
  onDiffRef?: (path: string, el: HTMLDivElement | null) => void;
  /** Project ID for @ mentions in comments */
  projectId: string;
  /** Attempt ID for opening files in IDE */
  attemptId: string;
}

// Memoized DiffItem - only re-renders when its specific diff reference changes
const DiffItem = memo(function DiffItem({
  diff,
  initialExpanded = true,
  onRef,
  projectId,
  attemptId,
}: {
  diff: Diff;
  initialExpanded?: boolean;
  onRef?: (path: string, el: HTMLDivElement | null) => void;
  projectId: string;
  attemptId: string;
}) {
  const path = diff.newPath || diff.oldPath || '';
  const [expanded, toggle] = usePersistedExpanded(
    `diff:${path}`,
    initialExpanded
  );

  // Compute input inside the component - this is fine because
  // React.memo compares the diff reference, not the input object
  const input: DiffInput = {
    type: 'content',
    oldContent: diff.oldContent || '',
    newContent: diff.newContent || '',
    oldPath: diff.oldPath || undefined,
    newPath: diff.newPath || '',
    changeKind: diff.change,
  };

  return (
    <div ref={(el) => onRef?.(path, el)}>
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

export const ChangesPanel = forwardRef<HTMLDivElement, ChangesPanelProps>(
  function ChangesPanel(
    { className, diffItems, onDiffRef, projectId, attemptId },
    ref
  ) {
    const { t } = useTranslation(['tasks', 'common']);

    return (
      <div
        ref={ref}
        className={cn(
          'w-full h-full bg-secondary flex flex-col px-base overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent',
          className
        )}
      >
        <div className="space-y-base">
          {diffItems.map(({ diff, initialExpanded }) => (
            <DiffItem
              key={diff.newPath || diff.oldPath || ''}
              diff={diff}
              initialExpanded={initialExpanded}
              onRef={onDiffRef}
              projectId={projectId}
              attemptId={attemptId}
            />
          ))}
        </div>
        {diffItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-low">
            <p className="text-sm">{t('common:empty.noChanges')}</p>
          </div>
        )}
      </div>
    );
  }
);
