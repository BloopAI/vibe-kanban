import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { GitPullRequestIcon, FileIcon } from '@phosphor-icons/react';
import { UserAvatar } from '@/components/tasks/UserAvatar';

export interface WorkspaceUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  imageUrl?: string | null;
}

export interface WorkspaceWithStats {
  id: string;
  displayId: string;
  branchName: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  prNumber?: number;
  prUrl?: string;
  prStatus?: 'open' | 'merged' | 'closed' | null;
  assignees: WorkspaceUser[];
  createdAt: string;
}

export interface IssueWorkspaceCardProps {
  workspace: WorkspaceWithStats;
  onClick?: () => void;
  className?: string;
}

export function IssueWorkspaceCard({
  workspace,
  onClick,
  className,
}: IssueWorkspaceCardProps) {
  const { t } = useTranslation('common');
  const timeAgo = getTimeAgo(workspace.createdAt);

  return (
    <div
      className={cn(
        'flex flex-col gap-half p-base bg-panel rounded-sm border border-transparent hover:border-border transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Row 1: Workspace ID + Branch Badge */}
      <div className="flex items-center gap-half">
        <span className="font-ibm-plex-mono text-sm text-high font-medium">
          {workspace.displayId}
        </span>
        <span className="inline-flex items-center px-base py-px bg-secondary rounded-sm text-sm text-low">
          {workspace.branchName}
        </span>
      </div>

      {/* Row 2: Files, Stats, PR Link, Avatar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-base text-sm text-low">
          {/* Time ago + Files */}
          <span className="flex items-center gap-half">
            {timeAgo}
            {workspace.filesChanged > 0 && (
              <>
                <span className="text-low/50">·</span>
                <FileIcon className="size-icon-2xs" weight="bold" />
                <span>{t('kanban.filesCount', { count: workspace.filesChanged })}</span>
              </>
            )}
          </span>

          {/* Diff stats */}
          {(workspace.linesAdded > 0 || workspace.linesRemoved > 0) && (
            <span className="flex items-center gap-half">
              <span className="text-low/50">·</span>
              {workspace.linesAdded > 0 && (
                <span className="text-success">+{workspace.linesAdded}</span>
              )}
              {workspace.linesRemoved > 0 && (
                <span className="text-error">-{workspace.linesRemoved}</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-base">
          {/* PR Link */}
          {workspace.prNumber && workspace.prUrl ? (
            <a
              href={workspace.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'flex items-center gap-half text-sm transition-colors',
                workspace.prStatus === 'merged'
                  ? 'text-success hover:text-success/80'
                  : workspace.prStatus === 'closed'
                    ? 'text-error hover:text-error/80'
                    : 'text-brand hover:text-brand-hover'
              )}
            >
              <GitPullRequestIcon className="size-icon-xs" weight="bold" />
              <span>#{workspace.prNumber.toString().padStart(3, '0')}</span>
            </a>
          ) : (
            <span className="text-sm text-low">{t('kanban.noPrCreated')}</span>
          )}

          {/* Assignee Avatars */}
          <div className="flex items-center -space-x-1">
            {workspace.assignees.slice(0, 3).map((user) => (
              <UserAvatar
                key={user.id}
                firstName={user.firstName}
                lastName={user.lastName}
                username={user.username}
                imageUrl={user.imageUrl}
                className="h-5 w-5 text-[10px] border-2 border-panel"
              />
            ))}
            {workspace.assignees.length > 3 && (
              <span className="h-5 w-5 rounded-full bg-secondary flex items-center justify-center text-[10px] text-low border-2 border-panel">
                +{workspace.assignees.length - 3}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}
