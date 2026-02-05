import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  GitPullRequestIcon,
  DotsThreeIcon,
  LinkBreakIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { UserAvatar } from '@/components/ui-new/primitives/UserAvatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { OrganizationMemberWithProfile } from 'shared/types';

export interface WorkspacePr {
  number: number;
  url: string;
  status: 'open' | 'merged' | 'closed';
}

export interface WorkspaceWithStats {
  id: string;
  localWorkspaceId: string | null;
  archived: boolean;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  prs: WorkspacePr[];
  owner: OrganizationMemberWithProfile | null;
  updatedAt: string;
  isOwnedByCurrentUser: boolean;
}

export interface IssueWorkspaceCardProps {
  workspace: WorkspaceWithStats;
  onClick?: () => void;
  onUnlink?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function IssueWorkspaceCard({
  workspace,
  onClick,
  onUnlink,
  onDelete,
  className,
}: IssueWorkspaceCardProps) {
  const { t } = useTranslation('common');
  const timeAgo = getTimeAgo(workspace.updatedAt);

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
      {/* Row 1: Status badge (left), Owner avatar + menu (right) */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-xs font-medium',
            workspace.archived
              ? 'bg-secondary text-low'
              : 'bg-success/10 text-success'
          )}
        >
          {workspace.archived
            ? t('workspaces.archived')
            : t('workspaces.active')}
        </span>

        <div className="flex items-center gap-half">
          {workspace.owner && (
            <UserAvatar
              user={workspace.owner}
              className="h-5 w-5 text-[10px] border-2 border-panel"
            />
          )}
          {(onUnlink || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="p-0.5 rounded hover:bg-secondary transition-colors"
                  aria-label={t('workspaces.more')}
                >
                  <DotsThreeIcon
                    className="size-icon-xs text-low"
                    weight="bold"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onUnlink && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnlink();
                    }}
                  >
                    <LinkBreakIcon className="size-icon-xs" />
                    {t('workspaces.unlinkFromIssue')}
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <TrashIcon className="size-icon-xs" />
                    {t('workspaces.deleteWorkspace')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Row 2: Stats (left), PR buttons (right) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-half text-sm text-low">
          <span>{timeAgo}</span>
          {workspace.filesChanged > 0 && (
            <>
              <span className="text-low/50">·</span>
              <span>
                {t('workspaces.filesChanged', {
                  count: workspace.filesChanged,
                })}
              </span>
            </>
          )}
          {workspace.linesAdded > 0 && (
            <>
              <span className="text-low/50">·</span>
              <span className="text-success">+{workspace.linesAdded}</span>
            </>
          )}
          {workspace.linesRemoved > 0 && (
            <>
              <span className="text-low/50">·</span>
              <span className="text-error">-{workspace.linesRemoved}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-half">
          {workspace.prs.length > 0 ? (
            workspace.prs.map((pr) => (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'flex items-center gap-half px-1.5 py-0.5 rounded text-xs font-medium transition-colors',
                  pr.status === 'merged'
                    ? 'bg-merged/10 text-merged hover:bg-merged/20'
                    : pr.status === 'closed'
                      ? 'bg-error/10 text-error hover:bg-error/20'
                      : 'bg-success/10 text-success hover:bg-success/20'
                )}
              >
                <GitPullRequestIcon className="size-icon-2xs" weight="bold" />
                <span>#{pr.number}</span>
              </a>
            ))
          ) : (
            <span className="text-xs text-low">{t('kanban.noPrCreated')}</span>
          )}
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
