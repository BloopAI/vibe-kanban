'use client';

import { useTranslation } from 'react-i18next';
import { CircleDashedIcon, PlusIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { IssuePriority, PullRequest, Tag } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import type { ResolvedRelationship } from '@/lib/resolveRelationships';
import { PriorityIcon } from '@/components/ui-new/primitives/PriorityIcon';
import { KanbanBadge } from '@/components/ui-new/primitives/KanbanBadge';
import { KanbanAssignee } from '@/components/ui-new/primitives/KanbanAssignee';
import { RunningDots } from '@/components/ui-new/primitives/RunningDots';
import { PrBadge } from '@/components/ui-new/primitives/PrBadge';
import { RelationshipBadge } from '@/components/ui-new/primitives/RelationshipBadge';
import { SearchableTagDropdownContainer } from '@/components/ui-new/containers/SearchableTagDropdownContainer';

export type TagEditProps = {
  allTags: Tag[];
  selectedTagIds: string[];
  onTagToggle: (tagId: string) => void;
  onCreateTag: (data: { name: string; color: string }) => string;
};

export type KanbanCardContentProps = {
  displayId: string;
  title: string;
  description?: string | null;
  priority: IssuePriority | null;
  tags: { id: string; name: string; color: string }[];
  assignees: OrganizationMemberWithProfile[];
  pullRequests?: PullRequest[];
  relationships?: ResolvedRelationship[];
  isSubIssue?: boolean;
  isLoading?: boolean;
  className?: string;
  onPriorityClick?: (e: React.MouseEvent) => void;
  onAssigneeClick?: (e: React.MouseEvent) => void;
  tagEditProps?: TagEditProps;
};

export const KanbanCardContent = ({
  displayId,
  title,
  description,
  priority,
  tags,
  assignees,
  pullRequests = [],
  relationships = [],
  isSubIssue,
  isLoading = false,
  className,
  onPriorityClick,
  onAssigneeClick,
  tagEditProps,
}: KanbanCardContentProps) => {
  const { t } = useTranslation('common');

  const tagsDisplay = (
    <>
      {tags.slice(0, 2).map((tag) => (
        <KanbanBadge key={tag.id} name={tag.name} color={tag.color} />
      ))}
      {tags.length > 2 && (
        <span className="text-sm text-low">+{tags.length - 2}</span>
      )}
      {tagEditProps && tags.length === 0 && (
        <PlusIcon className="size-icon-xs text-low" weight="bold" />
      )}
    </>
  );

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
          {onPriorityClick ? (
            <button
              type="button"
              onClick={onPriorityClick}
              className="flex items-center cursor-pointer hover:bg-secondary rounded-sm transition-colors"
            >
              <PriorityIcon priority={priority} />
              {!priority && (
                <CircleDashedIcon
                  className="size-icon-xs text-low"
                  weight="bold"
                />
              )}
            </button>
          ) : (
            <PriorityIcon priority={priority} />
          )}
          {tagEditProps ? (
            <SearchableTagDropdownContainer
              tags={tagEditProps.allTags}
              selectedTagIds={tagEditProps.selectedTagIds}
              onTagToggle={tagEditProps.onTagToggle}
              onCreateTag={tagEditProps.onCreateTag}
              disabled={false}
              contentClassName=""
              trigger={
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-half cursor-pointer hover:bg-secondary rounded-sm transition-colors"
                >
                  {tagsDisplay}
                </button>
              }
            />
          ) : (
            <>
              {tags.slice(0, 2).map((tag) => (
                <KanbanBadge key={tag.id} name={tag.name} color={tag.color} />
              ))}
              {tags.length > 2 && (
                <span className="text-sm text-low">+{tags.length - 2}</span>
              )}
            </>
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
          {relationships.slice(0, 2).map((rel) => (
            <RelationshipBadge
              key={rel.relationshipId}
              displayType={rel.displayType}
              relatedIssueDisplayId={rel.relatedIssueDisplayId}
              compact
            />
          ))}
          {relationships.length > 2 && (
            <span className="text-sm text-low">
              +{relationships.length - 2}
            </span>
          )}
        </div>
        {onAssigneeClick ? (
          <button
            type="button"
            onClick={onAssigneeClick}
            className="cursor-pointer hover:bg-secondary rounded-sm transition-colors"
          >
            <KanbanAssignee assignees={assignees} />
          </button>
        ) : (
          <KanbanAssignee assignees={assignees} />
        )}
      </div>
    </div>
  );
};
