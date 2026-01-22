import { cn } from '@/lib/utils';
import { PlusIcon } from '@phosphor-icons/react';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import {
  StatusDropdown,
  PriorityDropdown,
  SearchableAssigneeDropdown,
} from './PropertyDropdown';

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
  return (
    <div className={cn('flex items-center gap-half', className)}>
      <StatusDropdown
        statusId={statusId}
        statuses={statuses}
        onChange={onStatusChange}
        disabled={disabled}
      />

      <PriorityDropdown
        priority={priority}
        onChange={onPriorityChange}
        disabled={disabled}
      />

      <SearchableAssigneeDropdown
        assigneeId={assigneeId}
        users={users}
        onChange={onAssigneeChange}
        disabled={disabled}
      />

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
