import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { UsersIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { MemberRole, type OrganizationMemberWithProfile } from 'shared/types';
import { UserAvatar } from '@/components/tasks/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui-new/primitives/Dropdown';
import { SearchableDropdownContainer } from '@/components/ui-new/containers/SearchableDropdownContainer';

// =============================================================================
// Helper
// =============================================================================

const getUserDisplayName = (user: OrganizationMemberWithProfile): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

// =============================================================================
// Assignee Dropdown
// =============================================================================

export interface AssigneeDropdownProps {
  assigneeId: string | null;
  users: OrganizationMemberWithProfile[];
  onChange: (userId: string | null) => void;
  disabled?: boolean;
}

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
