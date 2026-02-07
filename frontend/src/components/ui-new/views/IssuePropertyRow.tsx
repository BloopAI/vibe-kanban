import { cn } from '@/lib/utils';
import { PlusIcon, UsersIcon, XIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { IconButton } from '@/components/ui-new/primitives/IconButton';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';

const priorityLabels: Record<IssuePriority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export interface IssuePropertyRowProps {
  statusId: string;
  priority: IssuePriority | null;
  assigneeIds: string[];
  assigneeUsers?: OrganizationMemberWithProfile[];
  statuses: ProjectStatus[];
  creatorUser?: OrganizationMemberWithProfile | null;
  parentIssue?: { id: string; simpleId: string } | null;
  onParentIssueClick?: () => void;
  onRemoveParentIssue?: () => void;
  onStatusClick: () => void;
  onPriorityClick: () => void;
  onAssigneeClick: () => void;
  onAddClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function IssuePropertyRow({
  statusId,
  priority,
  assigneeUsers,
  statuses,
  creatorUser,
  parentIssue,
  onParentIssueClick,
  onRemoveParentIssue,
  onStatusClick,
  onPriorityClick,
  onAssigneeClick,
  onAddClick,
  disabled,
  className,
}: IssuePropertyRowProps) {
  const { t } = useTranslation('common');

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
        {priority ? priorityLabels[priority] : 'No priority'}
      </PrimaryButton>

      <PrimaryButton
        variant="tertiary"
        onClick={onAssigneeClick}
        disabled={disabled}
      >
        {assigneeUsers && assigneeUsers.length > 0 ? (
          <KanbanAssignee assignees={assigneeUsers} />
        ) : (
          <>
            <UsersIcon className="size-icon-xs" weight="bold" />
            {t('kanban.assignee', 'Assignee')}
          </>
        )}
      </PrimaryButton>

      {creatorUser &&
        (creatorUser.first_name?.trim() || creatorUser.username?.trim()) && (
          <div className="flex items-center gap-half px-base py-half bg-panel rounded-sm text-sm whitespace-nowrap">
            <span className="text-low">
              {t('kanban.createdBy', 'Created by')}
            </span>
            <UserAvatar
              user={creatorUser}
              className="h-5 w-5 text-[9px] border border-border"
            />
            <span className="text-normal truncate max-w-[120px]">
              {creatorUser.first_name?.trim() || creatorUser.username?.trim()}
            </span>
          </div>
        )}

      {parentIssue && (
        <div className="flex items-center gap-half">
          <PrimaryButton
            variant="tertiary"
            onClick={onParentIssueClick}
            disabled={disabled}
            className="whitespace-nowrap text-sm"
          >
            <span className="text-low">
              {t('kanban.parentIssue', 'Parent')}:
            </span>
            <span className="font-ibm-plex-mono text-normal">
              {parentIssue.simpleId}
            </span>
          </PrimaryButton>
          {onRemoveParentIssue && (
            <IconButton
              icon={XIcon}
              onClick={onRemoveParentIssue}
              disabled={disabled}
              aria-label="Remove parent issue"
              title="Remove parent issue"
            />
          )}
        </div>
      )}

      {onAddClick && (
        <IconButton
          icon={PlusIcon}
          onClick={onAddClick}
          disabled={disabled}
          aria-label="Add"
          title="Add"
        />
      )}
    </div>
  );
}
