'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CircleDashedIcon,
  DotsThreeIcon,
  PlusIcon,
} from '@phosphor-icons/react';
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

const IMAGE_FILE_EXTENSION_REGEX =
  /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;

function isImageLikeAttachmentName(name: string): boolean {
  const normalized = name.trim();
  if (!normalized) {
    return false;
  }

  return IMAGE_FILE_EXTENSION_REGEX.test(normalized);
}

function formatKanbanDescriptionPreview(
  markdown: string,
  options: {
    codeBlockLabel: string;
    imageLabel: string;
    imageWithNameLabel: (name: string) => string;
    fileLabel: string;
    fileWithNameLabel: (name: string) => string;
  }
): string {
  return markdown
    .replace(/```[\s\S]*?```/g, options.codeBlockLabel)
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (_match, altText: string, url: string) => {
        const normalizedAlt = altText.trim();
        const normalizedUrl = url.trim();
        const isImageAttachment =
          normalizedUrl.startsWith('attachment://') &&
          isImageLikeAttachmentName(normalizedAlt);

        if (isImageAttachment) {
          return normalizedAlt
            ? options.imageWithNameLabel(normalizedAlt)
            : options.imageLabel;
        }

        return normalizedAlt
          ? options.fileWithNameLabel(normalizedAlt)
          : options.fileLabel;
      }
    )
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
  relationships?: ResolvedRelationship[];
  isSubIssue?: boolean;
  isLoading?: boolean;
  className?: string;
  onPriorityClick?: (e: React.MouseEvent) => void;
  onAssigneeClick?: (e: React.MouseEvent) => void;
  onMoreActionsClick?: () => void;
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
  onMoreActionsClick,
  tagEditProps,
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
      fileLabel: t('kanban.previewFile'),
      fileWithNameLabel: (name: string) =>
        t('kanban.previewFileWithName', { name }),
    });
    return formatted.length > 0 ? formatted : null;
  }, [description, t]);

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
      {/* Row 1: Task ID + sub-issue indicator + loading dots + more actions */}
      <div className="flex items-center justify-between gap-half">
        <div className="flex items-center gap-half min-w-0">
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
        {onMoreActionsClick && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoreActionsClick();
            }}
            className={cn(
              'p-half -m-half rounded-sm text-low hover:text-normal hover:bg-secondary shrink-0',
              'invisible opacity-0 group-hover:visible group-hover:opacity-100',
              'transition-[opacity,color,background-color]'
            )}
            aria-label="More actions"
            title="More actions"
          >
            <DotsThreeIcon className="size-icon-xs" weight="bold" />
          </button>
        )}
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
