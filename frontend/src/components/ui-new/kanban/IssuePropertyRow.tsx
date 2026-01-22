import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { PlusIcon, UsersIcon } from '@phosphor-icons/react';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import { PriorityIcon } from './Kanban';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';

export interface User {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
}

export interface IssuePropertyRowProps {
  statusId: string;
  priority: IssuePriority;
  assigneeId: string | null;
  statuses: ProjectStatus[];
  users: User[];
  onStatusChange: (statusId: string) => void;
  onPriorityChange: (priority: IssuePriority) => void;
  onAssigneeChange: (userId: string | null) => void;
  onAddClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function IssuePropertyRow({
  statusId,
  priority,
  assigneeId,
  statuses,
  users,
  onStatusChange,
  onPriorityChange,
  onAssigneeChange,
  onAddClick,
  disabled,
  className,
}: IssuePropertyRowProps) {
  const { t } = useTranslation('common');
  const selectedStatus = statuses.find((s) => s.id === statusId);
  const selectedAssignee = users.find((u) => u.id === assigneeId);

  return (
    <div className={cn('flex items-center gap-half', className)}>
      {/* Status Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex items-center gap-half px-base py-half bg-panel rounded-sm text-sm text-normal hover:bg-secondary transition-colors"
          >
            {selectedStatus && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(${selectedStatus.color}))` }}
              />
            )}
            <span className="truncate">{selectedStatus?.name ?? 'Status'}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {statuses.map((status) => (
            <DropdownMenuItem
              key={status.id}
              onClick={() => onStatusChange(status.id)}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: `hsl(var(${status.color}))` }}
              />
              {status.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Priority Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex items-center gap-half px-base py-half bg-panel rounded-sm text-sm text-normal hover:bg-secondary transition-colors"
          >
            <PriorityIcon priority={priority} className="h-4 w-4" />
            <span className="truncate">{priorityLabels[priority]}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onPriorityChange(p)}>
              <PriorityIcon priority={p} className="h-4 w-4" />
              {priorityLabels[p]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Assignee Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex items-center gap-half px-base py-half bg-panel rounded-sm text-sm text-normal hover:bg-secondary transition-colors"
          >
            {selectedAssignee ? (
              <>
                <UserAvatar
                  firstName={selectedAssignee.firstName}
                  lastName={selectedAssignee.lastName}
                  username={selectedAssignee.username}
                  imageUrl={selectedAssignee.imageUrl}
                  className="h-4 w-4 text-[8px]"
                />
                <span className="truncate max-w-[80px]">
                  {[selectedAssignee.firstName, selectedAssignee.lastName]
                    .filter(Boolean)
                    .join(' ') ||
                    selectedAssignee.username ||
                    'User'}
                </span>
              </>
            ) : (
              <UsersIcon className="size-icon-xs text-low" weight="bold" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onAssigneeChange(null)}>
            <UsersIcon className="size-icon-xs text-low" weight="bold" />
            {t('kanban.unassigned')}
          </DropdownMenuItem>
          {users.map((user) => (
            <DropdownMenuItem
              key={user.id}
              onClick={() => onAssigneeChange(user.id)}
            >
              <UserAvatar
                firstName={user.firstName}
                lastName={user.lastName}
                username={user.username}
                imageUrl={user.imageUrl}
                className="h-4 w-4 text-[8px]"
              />
              {[user.firstName, user.lastName].filter(Boolean).join(' ') ||
                user.username ||
                'User'}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Button */}
      {onAddClick && (
        <button
          type="button"
          onClick={onAddClick}
          disabled={disabled}
          className="flex items-center justify-center p-half rounded-sm text-low hover:text-normal hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <PlusIcon className="size-icon-xs" weight="bold" />
        </button>
      )}
    </div>
  );
}
