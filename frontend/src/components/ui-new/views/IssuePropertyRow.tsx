import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { PlusIcon, UsersIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority, ProjectStatus, User } from 'shared/remote-types';
import {
  MultiSelectDropdown,
  type MultiSelectDropdownOption,
} from '@/components/ui-new/primitives/MultiSelectDropdown';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const getUserDisplayName = (user: User): string => {
  return (
    [user.first_name, user.last_name].filter(Boolean).join(' ') ||
    user.username ||
    'User'
  );
};

export interface IssuePropertyRowProps {
  statusId: string;
  priority: IssuePriority;
  assigneeIds: string[];
  statuses: ProjectStatus[];
  users: User[];
  parentIssue?: { id: string; simpleId: string } | null;
  onParentIssueClick?: () => void;
  onStatusClick: () => void;
  onPriorityClick: () => void;
  onAssigneeChange: (userIds: string[]) => void;
  onAddClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function IssuePropertyRow({
  statusId,
  priority,
  assigneeIds,
  statuses,
  users,
  parentIssue,
  onParentIssueClick,
  onStatusClick,
  onPriorityClick,
  onAssigneeChange,
  onAddClick,
  disabled,
  className,
}: IssuePropertyRowProps) {
  const { t } = useTranslation('common');

  const assigneeOptions: MultiSelectDropdownOption<string>[] = useMemo(
    () =>
      users.map((user) => ({
        value: user.id,
        label: getUserDisplayName(user),
        renderOption: () => (
          <div className="flex items-center gap-half">
            <UserAvatar user={user} className="h-4 w-4 text-[8px]" />
            <span>{getUserDisplayName(user)}</span>
          </div>
        ),
      })),
    [users]
  );

  return (
    <div className={cn('flex items-center gap-half flex-wrap', className)}>
      <PrimaryButton
        variant="tertiary"
        onClick={onStatusClick}
        disabled={disabled}
      >
        <StatusDot
          color={statuses.find((s) => s.id === statusId)?.color ?? '0 0% 50%'}
        />
        {statuses.find((s) => s.id === statusId)?.name ?? 'Select status'}
      </PrimaryButton>

      <PrimaryButton
        variant="tertiary"
        onClick={onPriorityClick}
        disabled={disabled}
      >
        <PriorityIcon priority={priority} />
        {priorityLabels[priority]}
      </PrimaryButton>

      <MultiSelectDropdown
        values={assigneeIds}
        options={assigneeOptions}
        onChange={onAssigneeChange}
        icon={UsersIcon}
        label={t('kanban.assignee', 'Assignee')}
        disabled={disabled}
      />

      {parentIssue && (
        <button
          type="button"
          onClick={onParentIssueClick}
          className="flex items-center gap-half px-base py-half bg-panel rounded-sm text-sm hover:bg-secondary transition-colors whitespace-nowrap"
        >
          <span className="text-low">{t('kanban.parentIssue', 'Parent')}:</span>
          <span className="font-ibm-plex-mono text-normal">
            {parentIssue.simpleId}
          </span>
        </button>
      )}

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
