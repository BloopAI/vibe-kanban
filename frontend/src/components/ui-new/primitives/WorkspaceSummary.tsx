import {
  PushPinIcon,
  DotsThreeIcon,
  CopyIcon,
  ArchiveIcon,
  TrashIcon,
  HandIcon,
  TriangleIcon,
  PlayPauseIcon,
  FileIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui-new/primitives/Dropdown';

function RunningDots() {
  return (
    <div className="flex items-center gap-[2px] shrink-0">
      <span className="size-dot rounded-full bg-brand animate-running-dot-1" />
      <span className="size-dot rounded-full bg-brand animate-running-dot-2" />
      <span className="size-dot rounded-full bg-brand animate-running-dot-3" />
    </div>
  );
}

function formatTimeElapsed(dateString?: string): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
}

interface WorkspaceSummaryProps {
  name: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isActive?: boolean;
  isRunning?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  latestProcessCompletedAt?: string;
  latestProcessStatus?: 'running' | 'completed' | 'failed' | 'killed';
  onClick?: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onPin?: () => void;
  onDuplicate?: () => void;
  className?: string;
  summary?: boolean;
}

export function WorkspaceSummary({
  name,
  filesChanged,
  linesAdded,
  linesRemoved,
  isActive = false,
  isRunning = false,
  isPinned = false,
  isArchived = false,
  hasPendingApproval = false,
  hasRunningDevServer = false,
  latestProcessCompletedAt,
  latestProcessStatus,
  onClick,
  onDelete,
  onArchive,
  onPin,
  onDuplicate,
  className,
  summary = false,
}: WorkspaceSummaryProps) {
  const hasChanges = filesChanged !== undefined && filesChanged > 0;
  const isFailed =
    latestProcessStatus === 'failed' || latestProcessStatus === 'killed';
  const hasActions = onDelete || onArchive || onPin || onDuplicate;

  return (
    <div className={cn('group relative', className)}>
      <button
        onClick={onClick}
        className={cn(
          'flex w-full cursor-pointer flex-col border-l-4 text-left text-low',
          isActive ? 'border-normal pl-base' : 'border-none'
        )}
      >
        <div
          className={cn(
            'truncate group-hover:text-high pr-double',
            !summary && 'text-normal'
          )}
        >
          {name}
        </div>
        {(!summary || isActive) && (
          <div className="flex w-full items-center gap-base text-sm h-5">
            {/* Dev server running - leftmost */}
            {hasRunningDevServer && (
              <PlayPauseIcon
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

            {/* Pin icon */}
            {isPinned && (
              <PushPinIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}

            {/* Time elapsed (when not running) */}
            {!isRunning && latestProcessCompletedAt && (
              <span className="min-w-0 flex-1 truncate">
                {formatTimeElapsed(latestProcessCompletedAt)}
              </span>
            )}

            {/* Spacer when running (no elapsed time shown) */}
            {isRunning && <span className="flex-1" />}

            {/* Spacer when not running and no elapsed time */}
            {!isRunning && !latestProcessCompletedAt && (
              <span className="flex-1" />
            )}

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

      {hasActions && (
        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-half rounded-sm hover:bg-tertiary text-low hover:text-high focus:outline-none"
              >
                <DotsThreeIcon className="size-icon-sm" weight="bold" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onDuplicate && (
                <DropdownMenuItem
                  icon={CopyIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate();
                  }}
                >
                  Duplicate
                </DropdownMenuItem>
              )}
              {onPin && (
                <DropdownMenuItem
                  icon={PushPinIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin();
                  }}
                >
                  {isPinned ? 'Unpin' : 'Pin'}
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem
                  icon={ArchiveIcon}
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive();
                  }}
                >
                  {isArchived ? 'Unarchive' : 'Archive'}
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    icon={TrashIcon}
                    variant="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete();
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
