'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { IssuePriority, PullRequest } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { KanbanBadge } from '@/components/ui-new/primitives/KanbanBadge';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { RunningDots } from '@/components/ui-new/primitives/RunningDots';
import { PrBadge } from '@/components/ui-new/primitives/PrBadge';

export type KanbanCardContentProps = {
  displayId: string;
  title: string;
  description?: string | null;
  priority: IssuePriority | null;
  tags: { id: string; name: string; color: string }[];
  assignees: OrganizationMemberWithProfile[];
  pullRequests?: PullRequest[];
  isSubIssue?: boolean;
  isLoading?: boolean;
  className?: string;
};

export const KanbanCardContent = ({
  displayId,
  title,
  description,
  priority,
  tags,
  assignees,
  pullRequests = [],
  isSubIssue,
  isLoading = false,
  className,
}: KanbanCardContentProps) => {
  const { t } = useTranslation('common');

  return (
    <div className={cn('flex flex-col gap-half min-w-0', className)}>
      {/* Row 1: Task ID + sub-issue indicator + loading dots */}
      <div className="flex items-center gap-half">
        {isSubIssue && (
          <span className="text-sm text-low">
            {t('kanban.subIssueIndicator')}
          </span>
        )}
        <span className="font-ibm-plex-mono text-sm text-low truncate">
          {displayId}
        </span>
        {isLoading && <RunningDots />}
      </div>

      {/* Row 2: Title */}
      <span className="text-base text-normal truncate">{title}</span>

      {/* Row 3: Description (optional, truncated) */}
      {description && (
        <p className="text-sm text-low m-0 leading-relaxed line-clamp-4">
          {description}
        </p>
      )}

      {/* Row 4: Priority, Tags, Assignee */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-half flex-wrap flex-1 min-w-0">
          <PriorityIcon priority={priority} />
          {tags.slice(0, 2).map((tag) => (
            <KanbanBadge key={tag.id} name={tag.name} color={tag.color} />
          ))}
          {tags.length > 2 && (
            <span className="text-sm text-low">+{tags.length - 2}</span>
          )}
          {pullRequests.slice(0, 2).map((pr) => (
            <PrBadge
              key={pr.id}
              number={pr.number}
              url={pr.url}
              status={pr.status}
            />
          ))}
          {pullRequests.length > 2 && (
            <span className="text-sm text-low">+{pullRequests.length - 2}</span>
          )}
        </div>
        <KanbanAssignee assignees={assignees} />
      </div>
    </div>
  );
};
