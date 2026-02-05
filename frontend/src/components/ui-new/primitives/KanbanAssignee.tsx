'use client';

import { cn } from '@/lib/utils';
import { UsersIcon } from '@phosphor-icons/react';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import type { OrganizationMemberWithProfile } from 'shared/types';

const MAX_VISIBLE_AVATARS = 2;

export type KanbanAssigneeProps = {
  assignees: OrganizationMemberWithProfile[];
  className?: string;
};

export const KanbanAssignee = ({
  assignees,
  className,
}: KanbanAssigneeProps) => {
  if (assignees.length === 0) {
    // Unassigned state - show users icon
    return (
      <div
        className={cn('flex items-center justify-center', 'h-6 w-6', className)}
        aria-label="Unassigned"
      >
        <UsersIcon className="size-icon-xs text-low" weight="bold" />
      </div>
    );
  }

  const visibleAssignees = assignees.slice(0, MAX_VISIBLE_AVATARS);
  const remainingCount = assignees.length - MAX_VISIBLE_AVATARS;

  return (
    <div className={cn('flex items-center h-6', className)}>
      <div className="flex -space-x-1">
        {visibleAssignees.map((assignee) => (
          <UserAvatar
            key={assignee.user_id}
            user={assignee}
            className="h-5 w-5 text-[10px] ring-1 ring-background"
          />
        ))}
      </div>
      {remainingCount > 0 && (
        <span className="ml-half text-xs text-low">+{remainingCount}</span>
      )}
    </div>
  );
};
