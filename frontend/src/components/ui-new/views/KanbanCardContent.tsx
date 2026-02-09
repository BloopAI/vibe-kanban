'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { IssuePriority, PullRequest } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { KanbanBadge } from '@/components/ui-new/primitives/KanbanBadge';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { RunningDots } from '@/components/ui-new/primitives/RunningDots';
import { PrBadge } from '@/components/ui-new/primitives/PrBadge';

function formatKanbanDescriptionPreview(
  markdown: string,
  options: {
    codeBlockLabel: string;
    imageLabel: string;
    imageWithNameLabel: (name: string) => string;
  }
): string {
  return markdown
    .replace(/```[\s\S]*?```/g, options.codeBlockLabel)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, altText: string) => {
      const normalizedAlt = altText.trim();
      return normalizedAlt
        ? options.imageWithNameLabel(normalizedAlt)
        : options.imageLabel;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const previewDescription = useMemo(() => {
    if (!description) {
      return null;
    }

    const formatted = formatKanbanDescriptionPreview(description, {
      codeBlockLabel: t('kanban.previewCodeBlock'),
      imageLabel: t('kanban.previewImage'),
      imageWithNameLabel: (name: string) =>
        t('kanban.previewImageWithName', { name }),
    });
    return formatted.length > 0 ? formatted : null;
  }, [description, t]);

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
      {previewDescription && (
        <p className="text-sm text-low m-0 leading-relaxed line-clamp-4">
          {previewDescription}
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
