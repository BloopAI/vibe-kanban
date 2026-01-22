import { cn } from '@/lib/utils';
import { PlusIcon, GitPullRequestIcon, HashIcon } from '@phosphor-icons/react';
import type { Tag } from 'shared/remote-types';
import { KanbanBadge } from './Kanban';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui-new/primitives/Dropdown';

export interface LinkedPullRequest {
  id: string;
  number: number;
  url: string;
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
  onAddTag?: () => void;
  disabled?: boolean;
  className?: string;
}

export function IssueTagsRow({
  selectedTagIds,
  availableTags,
  linkedPrs = [],
  linkedIssues = [],
  onTagsChange,
  disabled,
  className,
}: IssueTagsRowProps) {
  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id)
  );

  const handleTagToggle = (tagId: string, checked: boolean) => {
    if (checked) {
      onTagsChange([...selectedTagIds, tagId]);
    } else {
      onTagsChange(selectedTagIds.filter((id) => id !== tagId));
    }
  };

  return (
    <div className={cn('flex items-center gap-half flex-wrap', className)}>
      {/* Selected Tags */}
      {selectedTags.map((tag) => (
        <KanbanBadge key={tag.id} name={tag.name} />
      ))}

      {/* Linked PRs */}
      {linkedPrs.map((pr) => (
        <a
          key={pr.id}
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-half h-5 px-base bg-panel rounded-sm text-sm text-low hover:text-normal transition-colors"
        >
          <GitPullRequestIcon className="size-icon-xs" weight="bold" />
          <span>PR-{pr.number.toString().padStart(3, '0')}</span>
        </a>
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            className="flex items-center justify-center h-5 w-5 rounded-sm text-low hover:text-normal hover:bg-panel transition-colors disabled:opacity-50"
          >
            <PlusIcon className="size-icon-xs" weight="bold" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {availableTags.length === 0 ? (
            <div className="px-base py-half text-sm text-low">
              No tags available
            </div>
          ) : (
            availableTags.map((tag) => (
              <DropdownMenuCheckboxItem
                key={tag.id}
                checked={selectedTagIds.includes(tag.id)}
                onCheckedChange={(checked) => handleTagToggle(tag.id, checked)}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0 mr-half"
                  style={{ backgroundColor: `hsl(var(${tag.color}))` }}
                />
                {tag.name}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
