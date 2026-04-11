import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GithubLogoIcon,
  ArrowSquareOutIcon,
  ChatsCircleIcon,
} from '@phosphor-icons/react';
import { CommentCard } from '@vibe/ui/components/CommentCard';
import { formatRelativeTime } from '@/shared/lib/date';
import type { NormalizedGitHubComment } from '@/shared/hooks/useWorkspaceContext';
import { MarkdownPreview } from '@/shared/components/MarkdownPreview';

interface GitHubCommentRendererProps {
  comment: NormalizedGitHubComment;
  onCopyToUserComment: () => void;
  theme: 'light' | 'dark';
}

export const GitHubCommentRenderer = memo(function GitHubCommentRenderer({
  comment,
  onCopyToUserComment,
  theme,
}: GitHubCommentRendererProps) {
  const { t } = useTranslation('common');

  const header = (
    <div className="flex items-center gap-half text-sm">
      <GithubLogoIcon className="size-icon-sm text-low" weight="fill" />
      <span className="font-medium text-normal">@{comment.author}</span>
      <span className="text-low">{formatRelativeTime(comment.createdAt)}</span>
      <div className="flex items-center gap-half ml-auto">
        <button
          className="text-low hover:text-normal"
          onClick={(e) => {
            e.stopPropagation();
            onCopyToUserComment();
          }}
          title={t('comments.copyToReview')}
        >
          <ChatsCircleIcon className="size-icon-xs" />
        </button>
        {comment.url && (
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-low hover:text-normal"
            onClick={(e) => e.stopPropagation()}
          >
            <ArrowSquareOutIcon className="size-icon-xs" />
          </a>
        )}
      </div>
    </div>
  );

  return (
    <CommentCard variant="github" header={header}>
      <MarkdownPreview
        content={comment.body}
        theme={theme}
        className="text-sm [text-wrap:wrap] [overflow-wrap:anywhere] break-words [&_p]:mb-1 [&_ul]:mb-1 [&_ol]:mb-1 [&_blockquote]:mb-1 [&_pre]:mb-1 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_p:last-child]:mb-0"
      />
    </CommentCard>
  );
});
