import {
  PushPinIcon,
  HandIcon,
  TriangleIcon,
  PlayIcon,
  FileIcon,
  CircleIcon,
  GitPullRequestIcon,
  ArchiveIcon,
  ListIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/utils/date';
import { CommandBarDialog } from '@/components/ui-new/dialogs/CommandBarDialog';
import { RunningDots } from './RunningDots';

interface WorkspaceSummaryProps {
  name: string;
  workspaceId?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isActive?: boolean;
  isRunning?: boolean;
  isPinned?: boolean;
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  hasUnseenActivity?: boolean;
  latestProcessCompletedAt?: string;
  latestProcessStatus?: 'running' | 'completed' | 'failed' | 'killed';
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
  onClick?: () => void;
  onArchive?: () => void;
  onPin?: () => void;
  className?: string;
  summary?: boolean;
  /** Whether this is a draft workspace (shows "Draft" instead of elapsed time) */
  isDraft?: boolean;
}

export function WorkspaceSummary({
  name,
  workspaceId,
  filesChanged,
  linesAdded,
  linesRemoved,
  isActive = false,
  isRunning = false,
  isPinned = false,
  hasPendingApproval = false,
  hasRunningDevServer = false,
  hasUnseenActivity = false,
  latestProcessCompletedAt,
  latestProcessStatus,
  prStatus,
  onClick,
  onArchive,
  onPin,
  className,
  summary = false,
  isDraft = false,
}: WorkspaceSummaryProps) {
  const { t } = useTranslation('common');
  const hasChanges = filesChanged !== undefined && filesChanged > 0;
  const isFailed =
    latestProcessStatus === 'failed' || latestProcessStatus === 'killed';

  const handleOpenCommandBar = (e: React.MouseEvent) => {
    e.stopPropagation();
    CommandBarDialog.show({
      page: 'workspaceActions',
      workspaceId,
    });
  };

  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    onArchive?.();
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPin?.();
  };

  return (
    <div
      className={cn(
        'group relative rounded-sm transition-all duration-100 overflow-hidden',
        isActive ? 'bg-tertiary' : '',
        className
      )}
    >
      {/* Selection indicator - thin colored tab on the left */}
      <div
        className={cn(
          'absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-colors duration-100',
          isActive ? 'bg-brand' : 'bg-transparent'
        )}
      />
      <button
        onClick={onClick}
        className={cn(
          'flex w-full cursor-pointer flex-col text-left px-base py-half transition-all duration-150',
          isActive
            ? 'text-normal'
            : 'text-low opacity-60 hover:opacity-100 hover:text-normal'
        )}
      >
        <div className={cn('truncate pr-double', !summary && 'text-normal')}>
          {name}
        </div>
        {(!summary || isActive) && (
          <div className="flex w-full items-center gap-base text-sm h-5">
            {/* Dev server running - leftmost */}
            {hasRunningDevServer && (
              <PlayIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}

            {/* Failed/killed status (only when not running) */}
            {!isRunning && isFailed && (
              <TriangleIcon
                className="size-icon-xs text-error shrink-0"
                weight="fill"
              />
            )}

            {/* Running dots OR hand icon for pending approval */}
            {isRunning &&
              (hasPendingApproval ? (
                <HandIcon
                  className="size-icon-xs text-brand shrink-0"
                  weight="fill"
                />
              ) : (
                <RunningDots />
              ))}

            {/* Unseen activity indicator (only when not running and not failed) */}
            {hasUnseenActivity && !isRunning && !isFailed && (
              <CircleIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}

            {/* PR status icon */}
            {prStatus === 'open' && (
              <GitPullRequestIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}
            {prStatus === 'merged' && (
              <GitPullRequestIcon
                className="size-icon-xs text-success shrink-0"
                weight="fill"
              />
            )}

            {/* Pin icon */}
            {isPinned && (
              <PushPinIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}

            {/* Time elapsed OR "Draft" label (when not running) */}
            {!isRunning &&
              (isDraft ? (
                <span className="min-w-0 flex-1 truncate">
                  {t('workspaces.draft')}
                </span>
              ) : latestProcessCompletedAt ? (
                <span className="min-w-0 flex-1 truncate">
                  {formatRelativeTime(latestProcessCompletedAt)}
                </span>
              ) : (
                <span className="flex-1" />
              ))}

            {/* Spacer when running (no elapsed time shown) */}
            {isRunning && <span className="flex-1" />}

            {/* File count + lines changed on the right */}
            {hasChanges && (
              <span className="shrink-0 text-right flex items-center gap-half">
                <FileIcon className="size-icon-xs" weight="fill" />
                <span>{filesChanged}</span>
                {linesAdded !== undefined && (
                  <span className="text-success">+{linesAdded}</span>
                )}
                {linesRemoved !== undefined && (
                  <span className="text-error">-{linesRemoved}</span>
                )}
              </span>
            )}
          </div>
        )}
      </button>

      {/* Right-side hover zone for action overlay */}
      {workspaceId && (
        <div className="absolute right-0 top-0 bottom-0 w-16 group/actions">
          {/* Sliding action overlay - only appears when hovering this zone */}
          <div
            className={cn(
              'absolute right-0 top-0 bottom-0 flex items-center',
              'translate-x-full group-hover/actions:translate-x-0',
              'transition-transform duration-150 ease-out'
            )}
          >
            {/* Gradient fade from transparent to pill background */}
            <div className="h-full w-6 pointer-events-none bg-gradient-to-r from-transparent to-secondary" />
            {/* Action pill */}
            <div className="flex items-center gap-0.5 pr-base h-full bg-secondary">
              <button
                onClick={handlePin}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  'p-1.5 rounded-sm transition-colors duration-100',
                  'hover:bg-tertiary',
                  isPinned ? 'text-brand' : 'text-low hover:text-normal'
                )}
                title={isPinned ? t('workspaces.unpin') : t('workspaces.pin')}
              >
                <PushPinIcon
                  className="size-icon-xs"
                  weight={isPinned ? 'fill' : 'regular'}
                />
              </button>
              <button
                onClick={handleArchive}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-sm text-low hover:text-normal hover:bg-tertiary transition-colors duration-100"
                title={t('workspaces.archive')}
              >
                <ArchiveIcon className="size-icon-xs" />
              </button>
              <button
                onClick={handleOpenCommandBar}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1.5 rounded-sm text-low hover:text-normal hover:bg-tertiary transition-colors duration-100"
                title={t('workspaces.more')}
              >
                <ListIcon className="size-icon-xs" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
