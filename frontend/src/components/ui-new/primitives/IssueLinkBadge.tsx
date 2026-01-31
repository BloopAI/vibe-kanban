import { Link } from 'react-router-dom';
import { LinkSimpleIcon, XIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

export interface IssueLinkBadgeProps {
  projectId: string;
  issueId: string;
  simpleId: string;
  onRemove?: () => void;
  className?: string;
}

export function IssueLinkBadge({
  projectId,
  issueId,
  simpleId,
  onRemove,
  className,
}: IssueLinkBadgeProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-half px-1.5 py-0.5 rounded text-xs font-medium bg-panel text-low',
        className
      )}
    >
      <Link
        to={`/projects/${projectId}/issues/${issueId}`}
        className="flex items-center gap-half hover:text-normal transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <LinkSimpleIcon className="size-icon-2xs" weight="bold" />
        <span className="font-mono">{simpleId}</span>
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="p-0.5 rounded hover:bg-secondary hover:text-normal transition-colors"
          aria-label="Remove issue link"
        >
          <XIcon className="size-icon-2xs" weight="bold" />
        </button>
      )}
    </div>
  );
}
