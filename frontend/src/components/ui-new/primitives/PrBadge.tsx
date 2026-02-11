import { cn } from '@/lib/utils';
import { GitPullRequestIcon } from '@phosphor-icons/react';
import type { PullRequestStatus } from 'shared/remote-types';

export interface PrBadgeProps {
  number: number;
  url: string;
  status: PullRequestStatus;
  className?: string;
}

export function PrBadge({ number, url, status, className }: PrBadgeProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-half px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
        status === 'merged'
          ? 'bg-merged/10 text-merged hover:bg-merged/20'
          : status === 'closed'
            ? 'bg-error/10 text-error hover:bg-error/20'
            : 'bg-success/10 text-success hover:bg-success/20',
        className
      )}
    >
      <GitPullRequestIcon className="size-icon-2xs" weight="bold" />
      <span>#{number}</span>
    </a>
  );
}
