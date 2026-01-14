import { GithubLogoIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { CommentCard } from '../primitives/CommentCard';
import { formatRelativeTime } from '@/utils/date';
import type { NormalizedGitHubComment } from '@/contexts/WorkspaceContext';

interface GitHubCommentRendererProps {
  comment: NormalizedGitHubComment;
}

/**
 * Read-only renderer for GitHub PR comments.
 * Uses CommentCard primitive with 'github' variant for neutral styling.
 */
export function GitHubCommentRenderer({ comment }: GitHubCommentRendererProps) {
  const header = (
    <div className="flex items-center gap-half text-sm">
      <GithubLogoIcon className="size-icon-sm text-low" weight="fill" />
      <span className="font-medium text-normal">@{comment.author}</span>
      <span className="text-low">{formatRelativeTime(comment.createdAt)}</span>
      {comment.url && (
        <a
          href={comment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-low hover:text-normal ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <ArrowSquareOutIcon className="size-icon-xs" />
        </a>
      )}
    </div>
  );

  return (
    <CommentCard variant="github" header={header}>
      <div className="text-sm text-normal whitespace-pre-wrap break-words">
        {comment.body}
      </div>
    </CommentCard>
  );
}
