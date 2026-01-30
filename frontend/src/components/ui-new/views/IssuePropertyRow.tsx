import { cn } from '@/lib/utils';
import { PlusIcon, UsersIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { IssuePriority, ProjectStatus } from 'shared/remote-types';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { StatusDot } from '@/components/ui-new/primitives/StatusDot';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { Badge } from '@/components/ui/badge';

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
  statuses: ProjectStatus[];
  parentIssue?: { id: string; simpleId: string } | null;
  onParentIssueClick?: () => void;
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
  assigneeIds,
  statuses,
  parentIssue,
  onParentIssueClick,
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
        <UsersIcon className="size-icon-xs" weight="bold" />
        {t('kanban.assignee', 'Assignee')}
        {assigneeIds.length > 0 && (
          <Badge
            variant="secondary"
            className="px-1.5 py-0 text-xs h-5 min-w-5 justify-center bg-brand text-on-brand border-none"
          >
            {assigneeIds.length}
          </Badge>
        )}
      </PrimaryButton>

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
