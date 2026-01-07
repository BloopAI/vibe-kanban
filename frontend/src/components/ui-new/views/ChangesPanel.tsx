import { memo } from 'react';
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
  projectId?: string;
  /** Attempt ID for opening files in IDE */
  attemptId?: string;
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
  projectId?: string;
  attemptId?: string;
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
  };

  return (
    <div ref={(el) => onRef?.(path, el)}>
      <DiffViewCardWithComments
        input={input}
        expanded={expanded}
        onToggle={toggle}
        projectId={projectId}
        attemptId={attemptId}
      />
    </div>
  );
});

export function ChangesPanel({
  className,
  diffItems,
  onDiffRef,
  projectId,
  attemptId,
}: ChangesPanelProps) {
  return (
    <div
      className={cn(
        'w-full h-full bg-secondary flex flex-col p-base overflow-y-auto scrollbar-thin scrollbar-thumb-panel scrollbar-track-transparent',
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
          <p className="text-sm">No changes to display</p>
        </div>
      )}
    </div>
  );
}
