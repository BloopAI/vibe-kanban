import { GithubLogoIcon, ArrowSquareOutIcon } from '@phosphor-icons/react';
import { CommentCard } from '../primitives/CommentCard';
import type { NormalizedGitHubComment } from '@/contexts/WorkspaceContext';

interface GitHubCommentRendererProps {
  comment: NormalizedGitHubComment;
}

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
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
