import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { UsersIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';
import { StatusDot, PriorityIcon } from './Icons';

// =============================================================================
// Generic Property Dropdown
// =============================================================================

export interface PropertyDropdownOption<T extends string = string> {
  value: T;
  label: string;
  renderOption?: () => ReactNode;
  renderTrigger?: () => ReactNode;
}

export interface PropertyDropdownProps<T extends string = string> {
  value: T;
  options: PropertyDropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  renderTrigger?: (
    selectedOption: PropertyDropdownOption<T> | undefined
  ) => ReactNode;
  disabled?: boolean;
  triggerClassName?: string;
  align?: 'start' | 'center' | 'end';
}

export function PropertyDropdown<T extends string = string>({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  renderTrigger,
  disabled,
  triggerClassName,
  align = 'start',
}: PropertyDropdownProps<T>) {
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center gap-half px-base py-half bg-panel rounded-sm',
            'text-sm text-normal hover:bg-secondary transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            triggerClassName
          )}
        >
          {renderTrigger
            ? renderTrigger(selectedOption)
            : (selectedOption?.renderTrigger?.() ?? (
                <span className="truncate">
                  {selectedOption?.label ?? placeholder}
                </span>
              ))}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange(option.value)}
          >
            {option.renderOption?.() ?? <span>{option.label}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =============================================================================
// Status Dropdown
// =============================================================================

export interface StatusDropdownProps {
  statusId: string;
  statuses: ProjectStatus[];
  onChange: (statusId: string) => void;
  disabled?: boolean;
}

export function StatusDropdown({
  statusId,
  statuses,
  onChange,
  disabled,
}: StatusDropdownProps) {
  const selectedStatus = statuses.find((s) => s.id === statusId);

  const options = statuses.map((status) => ({
    value: status.id,
    label: status.name,
    renderOption: () => (
      <div className="flex items-center gap-base">
        <StatusDot color={status.color} />
        {status.name}
      </div>
    ),
  }));

  return (
    <PropertyDropdown
      value={statusId}
      options={options}
      onChange={onChange}
      placeholder="Status"
      disabled={disabled}
      triggerClassName="gap-base"
      renderTrigger={() => (
        <>
          {selectedStatus && <StatusDot color={selectedStatus.color} />}
          <span className="truncate">{selectedStatus?.name ?? 'Status'}</span>
        </>
      )}
    />
  );
}

// =============================================================================
// Priority Dropdown
// =============================================================================

const PRIORITIES: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface PriorityDropdownProps {
  priority: IssuePriority;
  onChange: (priority: IssuePriority) => void;
  disabled?: boolean;
}

export function PriorityDropdown({
  priority,
  onChange,
  disabled,
}: PriorityDropdownProps) {
  const options = PRIORITIES.map((p) => ({
    value: p,
    label: priorityLabels[p],
    renderOption: () => (
      <div className="flex items-center gap-base">
        <PriorityIcon priority={p} />
        {priorityLabels[p]}
      </div>
    ),
  }));

  return (
    <PropertyDropdown
      value={priority}
      options={options}
      onChange={onChange}
      disabled={disabled}
      renderTrigger={() => (
        <>
          <PriorityIcon priority={priority} />
          <span className="truncate">{priorityLabels[priority]}</span>
        </>
      )}
    />
  );
}

// =============================================================================
// Assignee Dropdown
// =============================================================================

export interface AssigneeDropdownProps {
  assigneeId: string | null;
  users: OrganizationMemberWithProfile[];
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

const getUserDisplayName = (user: OrganizationMemberWithProfile): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

export function AssigneeDropdown({
  assigneeId,
  users,
  onChange,
  disabled,
}: AssigneeDropdownProps) {
  const { t } = useTranslation('common');
  const selectedAssignee = users.find((u) => u.user_id === assigneeId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            'flex items-center gap-half px-base py-half bg-panel rounded-sm',
            'text-sm text-normal hover:bg-secondary transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
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
                {getUserDisplayName(selectedAssignee)}
              </span>
            </>
          ) : (
            <UsersIcon className="size-icon-xs text-low" weight="bold" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange(null)}>
          <UsersIcon className="size-icon-xs text-low" weight="bold" />
          {t('kanban.unassigned')}
        </DropdownMenuItem>
        {users.map((user) => (
          <DropdownMenuItem
            key={user.user_id}
            onClick={() => onChange(user.user_id)}
          >
            <UserAvatar
              firstName={user.first_name}
              lastName={user.last_name}
              username={user.username}
              imageUrl={user.avatar_url}
              className="h-4 w-4 text-[8px]"
            />
            {getUserDisplayName(user)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
