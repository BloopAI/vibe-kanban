'use client';

import { cn } from '@/lib/utils';
import { UsersIcon } from '@phosphor-icons/react';
import { UserAvatar } from '@/components/tasks/UserAvatar';

export type KanbanAssigneeProps = {
  assignee: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    imageUrl?: string | null;
  } | null;
  className?: string;
};

export const KanbanAssignee = ({
  assignee,
  className,
}: KanbanAssigneeProps) => {
  if (!assignee) {
    // Unassigned state - show users icon
    return (
      <div
        className={cn('flex items-center justify-center', 'h-5 w-5', className)}
        aria-label="Unassigned"
      >
        <UsersIcon className="size-icon-xs text-low" weight="bold" />
      </div>
    );
  }

  // Assigned state - show avatar with name
  const displayName =
    [assignee.firstName, assignee.lastName].filter(Boolean).join(' ') ||
    assignee.username ||
    '';

  return (
    <div className={cn('flex items-center gap-half h-5', className)}>
      <UserAvatar
        firstName={assignee.firstName}
        lastName={assignee.lastName}
        username={assignee.username}
        imageUrl={assignee.imageUrl}
        className="h-3 w-3 text-[8px] border-white"
      />
      {displayName && (
        <span className="text-sm text-normal truncate max-w-[80px]">
          {displayName}
        </span>
      )}
    </div>
  );
};
