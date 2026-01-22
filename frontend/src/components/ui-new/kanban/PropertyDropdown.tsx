import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { UsersIcon, CaretDownIcon, type Icon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import { MemberRole, type OrganizationMemberWithProfile } from 'shared/types';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';
import { SearchableDropdownContainer } from '@/components/ui-new/containers/SearchableDropdownContainer';
import { StatusDot, PriorityIcon } from './Icons';

// =============================================================================
// Generic Property Dropdown
// =============================================================================

export interface PropertyDropdownOption<T extends string = string> {
  value: T;
  label: string;
  renderOption?: () => ReactNode;
}

export interface PropertyDropdownProps<T extends string = string> {
  value: T;
  options: PropertyDropdownOption<T>[];
  onChange: (value: T) => void;
  icon?: Icon;
  label?: string;
  disabled?: boolean;
}

export function PropertyDropdown<T extends string = string>({
  value,
  options,
  onChange,
  icon: IconComponent,
  label,
  disabled,
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
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {IconComponent ? (
            <>
              <IconComponent className="size-icon-xs" weight="bold" />
              {label && <span>{label}:</span>}
              <span>{selectedOption?.label}</span>
            </>
          ) : (
            (selectedOption?.renderOption?.() ?? selectedOption?.label)
          )}
          <CaretDownIcon className="size-icon-2xs text-low" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
      disabled={disabled}
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

// =============================================================================
// Searchable Assignee Dropdown
// =============================================================================

// Sentinel value for the "Unassigned" option
const UNASSIGNED_SENTINEL = '__UNASSIGNED__';

export interface SearchableAssigneeDropdownProps {
  assigneeId: string | null;
  users: OrganizationMemberWithProfile[];
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

export function SearchableAssigneeDropdown({
  assigneeId,
  users,
  onChange,
  disabled,
}: SearchableAssigneeDropdownProps) {
  const { t } = useTranslation('common');
  const selectedAssignee = users.find((u) => u.user_id === assigneeId);

  // Create options list with "Unassigned" at top
  const allOptions = useMemo(() => {
    const unassignedOption: OrganizationMemberWithProfile = {
      user_id: UNASSIGNED_SENTINEL,
      role: MemberRole.MEMBER,
      joined_at: '',
      first_name: null,
      last_name: null,
      username: t('kanban.unassigned'),
      email: null,
      avatar_url: null,
    };
    return [unassignedOption, ...users];
  }, [users, t]);

  const handleSelect = (item: OrganizationMemberWithProfile) => {
    onChange(item.user_id === UNASSIGNED_SENTINEL ? null : item.user_id);
  };

  const filterUser = (
    user: OrganizationMemberWithProfile,
    query: string
  ): boolean => {
    // Always show "Unassigned" option
    if (user.user_id === UNASSIGNED_SENTINEL) return true;

    const displayName = getUserDisplayName(user).toLowerCase();
    const username = (user.username || '').toLowerCase();
    const email = (user.email || '').toLowerCase();
    return (
      displayName.includes(query) ||
      username.includes(query) ||
      email.includes(query)
    );
  };

  const getItemIcon = (user: OrganizationMemberWithProfile): ReactNode => {
    if (user.user_id === UNASSIGNED_SENTINEL) {
      return <UsersIcon className="size-icon-xs text-low" weight="bold" />;
    }
    return (
      <UserAvatar
        firstName={user.first_name}
        lastName={user.last_name}
        username={user.username}
        imageUrl={user.avatar_url}
        className="h-4 w-4 text-[8px]"
      />
    );
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
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
  );

  return (
    <SearchableDropdownContainer
      items={allOptions}
      selectedValue={assigneeId ?? UNASSIGNED_SENTINEL}
      getItemKey={(u) => u.user_id}
      getItemLabel={getUserDisplayName}
      filterItem={filterUser}
      onSelect={handleSelect}
      trigger={trigger}
      getItemIcon={getItemIcon}
      contentClassName="w-[240px]"
      placeholder={t('kanban.searchAssignees', 'Search assignees...')}
      emptyMessage={t('kanban.noAssigneesFound', 'No assignees found')}
      getItemBadge={null}
    />
  );
}

// =============================================================================
