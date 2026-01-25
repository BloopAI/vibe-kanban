'use client';

import { cn } from '@/lib/utils';
import type { IssuePriority, User } from 'shared/remote-types';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';

/**
 * Formats a date as a relative time string (e.g., "1d", "2h", "3m")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `${diffDays}d`;
  }
  if (diffHours > 0) {
    return `${diffHours}h`;
  }
  if (diffMinutes > 0) {
    return `${diffMinutes}m`;
  }
  return 'now';
}

export interface SubIssueRowProps {
  simpleId: string;
  title: string;
  priority: IssuePriority;
  statusColor: string;
  assignees: User[];
  createdAt: string;
  onClick?: () => void;
  className?: string;
}

export function SubIssueRow({
  simpleId,
  title,
  priority,
  statusColor,
  assignees,
  createdAt,
  onClick,
  className,
}: SubIssueRowProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        'flex items-center gap-half px-base py-half rounded-sm transition-colors',
        onClick && 'cursor-pointer hover:bg-secondary',
        className
      )}
    >
      {/* Left side: Priority, ID, Status, Title */}
      <div className="flex items-center gap-half flex-1 min-w-0">
        <PriorityIcon priority={priority} />
        <span className="font-ibm-plex-mono text-sm text-normal shrink-0">
          {simpleId}
        </span>
        <StatusDot color={statusColor} />
        <span className="text-base text-high truncate">{title}</span>
      </div>

      {/* Right side: Assignee, Age */}
      <div className="flex items-center gap-half shrink-0">
        <KanbanAssignee assignees={assignees} />
        <span className="text-sm text-low">
          {formatRelativeTime(createdAt)}
        </span>
      </div>
    </div>
  );
}
