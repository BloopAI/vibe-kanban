import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { PlusIcon, UsersIcon } from '@phosphor-icons/react';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { PriorityIcon } from './Kanban';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';

export interface IssuePropertyRowProps {
  statusId: string;
  priority: IssuePriority;
  assigneeId: string | null;
  statuses: ProjectStatus[];
  users: OrganizationMemberWithProfile[];
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
  const selectedAssignee = users.find((u) => u.user_id === assigneeId);

  return (
    <div className={cn('flex items-center gap-half', className)}>
      {/* Status Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex items-center gap-base px-base py-half bg-panel rounded-sm text-sm text-normal hover:bg-secondary transition-colors"
          >
            {selectedStatus && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedStatus.color }}
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
              <div className="flex items-center gap-base">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: status.color }}
                />
                {status.name}
              </div>
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
            <PriorityIcon priority={priority} />
            <span className="truncate">{priorityLabels[priority]}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem key={p} onClick={() => onPriorityChange(p)}>
              <div className="flex items-center gap-base">
                <PriorityIcon priority={p} />
                {priorityLabels[p]}
              </div>
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
                  firstName={selectedAssignee.first_name}
                  lastName={selectedAssignee.last_name}
                  username={selectedAssignee.username}
                  imageUrl={selectedAssignee.avatar_url}
                  className="h-4 w-4 text-[8px]"
                />
                <span className="truncate max-w-[80px]">
                  {[selectedAssignee.first_name, selectedAssignee.last_name]
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
              key={user.user_id}
              onClick={() => onAssigneeChange(user.user_id)}
            >
              <UserAvatar
                firstName={user.first_name}
                lastName={user.last_name}
                username={user.username}
                imageUrl={user.avatar_url}
                className="h-4 w-4 text-[8px]"
              />
              {[user.first_name, user.last_name].filter(Boolean).join(' ') ||
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
