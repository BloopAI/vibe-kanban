'use client';

import { cn } from '@/lib/utils';
import type { IssuePriority, User } from 'shared/remote-types';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { KanbanBadge } from '@/components/ui-new/primitives/KanbanBadge';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { RunningDots } from '@/components/ui-new/primitives/RunningDots';

export type KanbanCardContentProps = {
  displayId: string;
  title: string;
  description?: string | null;
  priority: IssuePriority;
  tags: { id: string; name: string }[];
  assignees: User[];
  isLoading?: boolean;
  className?: string;
};

export const KanbanCardContent = ({
  displayId,
  title,
  description,
  priority,
  tags,
  assignees,
  isLoading = false,
  className,
}: KanbanCardContentProps) => {
  return (
    <div className={cn('flex flex-col gap-half', className)}>
      {/* Row 1: Task ID + loading dots */}
      <div className="flex items-center gap-half">
        <span className="font-ibm-plex-mono text-sm text-low">{displayId}</span>
        {isLoading && <RunningDots />}
      </div>

      {/* Row 2: Title */}
      <span className="text-base text-high">{title}</span>

      {/* Row 3: Description (optional, truncated) */}
      {description && (
        <p className="text-sm text-low m-0 leading-relaxed line-clamp-base">
          {description}
        </p>
      )}

      {/* Row 4: Priority, Tags, Assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-half flex-wrap flex-1 min-w-0">
          <PriorityIcon priority={priority} />
          {tags.slice(0, 2).map((tag) => (
            <KanbanBadge key={tag.id} name={tag.name} />
          ))}
          {tags.length > 2 && (
            <span className="text-sm text-low">+{tags.length - 2}</span>
          )}
        </div>
        <KanbanAssignee assignees={assignees} />
      </div>
    </div>
  );
};
