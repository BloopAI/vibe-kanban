import { cn } from '@/lib/utils';
import { PlusIcon, HashIcon } from '@phosphor-icons/react';
import type { Tag, PullRequestStatus } from 'shared/remote-types';
import { SearchableTagDropdownContainer } from '@/components/ui-new/containers/SearchableTagDropdownContainer';
import { PrBadge } from '@/components/ui-new/primitives/PrBadge';

// Re-export PRESET_COLORS (and TAG_COLORS for backwards compatibility)
export { PRESET_COLORS } from '@/lib/colors';
export { TAG_COLORS } from '@/components/ui-new/primitives/SearchableTagDropdown';

export interface LinkedPullRequest {
  id: string;
  number: number;
  url: string;
  status: PullRequestStatus;
}

export interface LinkedIssue {
  id: string;
  displayId: string;
  title: string;
}

export interface IssueTagsRowProps {
  selectedTagIds: string[];
  availableTags: Tag[];
  linkedPrs?: LinkedPullRequest[];
  linkedIssues?: LinkedIssue[];
  onTagsChange: (tagIds: string[]) => void;
  onCreateTag?: (data: { name: string; color: string }) => string;
  disabled?: boolean;
  className?: string;
}

export function IssueTagsRow({
  selectedTagIds,
  availableTags,
  linkedPrs = [],
  linkedIssues = [],
  onTagsChange,
  onCreateTag,
  disabled,
  className,
}: IssueTagsRowProps) {
  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );

  const handleTagToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTagIds, tagId]);
    }
  };

  const handleCreateTag = (data: { name: string; color: string }): string => {
    return onCreateTag?.(data) ?? '';
  };

  return (
    <div className={cn('flex items-center gap-half flex-wrap', className)}>
      {/* Selected Tags - clickable to remove on hover */}
      {selectedTags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => handleTagToggle(tag.id)}
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-center',
            'h-5 px-base gap-half',
            'bg-panel rounded-sm',
            'text-sm text-low font-medium',
            'whitespace-nowrap',
            'transition-colors',
            !disabled &&
              'hover:bg-error/20 hover:text-error hover:line-through cursor-pointer',
            disabled && 'cursor-default'
          )}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: `hsl(${tag.color})` }}
          />
          {tag.name}
        </button>
      ))}

      {/* Linked PRs */}
      {linkedPrs.map((pr) => (
        <PrBadge
          key={pr.id}
          number={pr.number}
          url={pr.url}
          status={pr.status}
        />
      ))}

      {/* Linked Issues */}
      {linkedIssues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          className="inline-flex items-center gap-half h-5 px-base bg-panel rounded-sm text-sm text-low hover:text-normal transition-colors"
          title={issue.title}
        >
          <HashIcon className="size-icon-xs" weight="bold" />
          <span>{issue.displayId}</span>
        </button>
      ))}

      {/* Add Tag Dropdown */}
      {onCreateTag && (
        <SearchableTagDropdownContainer
          tags={availableTags}
          selectedTagIds={selectedTagIds}
          onTagToggle={handleTagToggle}
          onCreateTag={handleCreateTag}
          disabled={disabled ?? false}
          contentClassName=""
          trigger={
            <button
              type="button"
              className="flex items-center justify-center h-5 w-5 rounded-sm text-low hover:text-normal hover:bg-panel transition-colors disabled:opacity-50"
            >
              <PlusIcon className="size-icon-xs" weight="bold" />
            </button>
          }
        />
      )}
    </div>
  );
}
