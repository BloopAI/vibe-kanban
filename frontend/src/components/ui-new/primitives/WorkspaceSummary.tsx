import {
  PushPinIcon,
  DotsThreeIcon,
  CopyIcon,
  ArchiveIcon,
  TrashIcon,
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

interface WorkspaceSummaryProps {
  name: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isActive?: boolean;
  isRunning?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
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
  onClick,
  onDelete,
  onArchive,
  onPin,
  onDuplicate,
  className,
  summary = false,
}: WorkspaceSummaryProps) {
  const hasStats = filesChanged !== undefined;
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
        {hasStats && (!summary || isActive) && (
          <div className="flex w-full items-center gap-base text-sm">
            {isRunning && <RunningDots />}
            {isPinned && (
              <PushPinIcon
                className="size-icon-xs text-brand shrink-0"
                weight="fill"
              />
            )}
            <span className="min-w-0 flex-1 truncate">
              {filesChanged} {filesChanged === 1 ? 'File' : 'Files'} changed
            </span>
            <span className="shrink-0 text-right space-x-half">
              {linesAdded !== undefined && (
                <span className="text-success">+{linesAdded}</span>
              )}
              {linesRemoved !== undefined && (
                <>
                  {linesAdded !== undefined && ' '}
                  <span className="text-error">-{linesRemoved}</span>
                </>
              )}
            </span>
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
