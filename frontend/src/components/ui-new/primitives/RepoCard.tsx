import {
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  ArrowsClockwiseIcon,
  TrashIcon,
  FileTextIcon,
  ArrowUpIcon,
  CrosshairIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './Dropdown';
import { CollapsibleSection } from './CollapsibleSection';

interface RepoCardProps {
  name: string;
  currentBranch: string;
  commitsAhead?: number;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  branchDropdownContent?: React.ReactNode;
  onActionsClick?: () => void;
  className?: string;
}

export function RepoCard({
  name,
  currentBranch,
  commitsAhead = 0,
  filesChanged = 0,
  linesAdded,
  linesRemoved,
  branchDropdownContent,
  onActionsClick,
  className,
}: RepoCardProps) {
  return (
    <CollapsibleSection
      title={name}
      className={cn('gap-half', className)}
      defaultExpanded
    >
      {/* Branch row */}
      <div className="flex items-center justify-between w-full py-half">
        <div className="flex items-center gap-base">
          <div className="flex items-center justify-center">
            <GitBranchIcon className="size-icon-base text-base" weight="fill" />
          </div>
          <div className="flex items-center justify-center">
            <ArrowRightIcon className="size-icon-sm text-low" weight="bold" />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger icon={CrosshairIcon} label={currentBranch} />
            <DropdownMenuContent>
              {branchDropdownContent ?? (
                <>
                  <DropdownMenuItem icon={GitMergeIcon}>Merge</DropdownMenuItem>
                  <DropdownMenuItem icon={ArrowsClockwiseIcon}>
                    Rebase
                  </DropdownMenuItem>
                  <DropdownMenuItem icon={GitPullRequestIcon}>
                    Create PR
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={TrashIcon} variant="destructive">
                    Remove
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Commits badge */}
        {commitsAhead > 0 && (
          <div className="flex items-center py-half">
            <span className="text-sm font-medium text-brand-secondary">
              {commitsAhead}
            </span>
            <ArrowUpIcon
              className="size-icon-xs text-brand-secondary"
              weight="bold"
            />
          </div>
        )}
      </div>

      {/* Files changed row */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-half">
          <FileTextIcon className="size-icon-xs text-low" />
          <span className="text-sm font-medium text-low truncate">
            {filesChanged} {filesChanged === 1 ? 'File' : 'Files'} changed
          </span>
        </div>
        <span className="text-sm font-semibold text-right">
          {linesAdded !== undefined && (
            <span className="text-success">+{linesAdded} </span>
          )}
          {linesRemoved !== undefined && (
            <span className="text-error">-{linesRemoved}</span>
          )}
        </span>
      </div>

      {/* Actions button */}
      <div className="flex items-center justify-center w-full py-plusfifty">
        <button
          type="button"
          onClick={onActionsClick}
          className="flex-1 bg-panel rounded-sm p-base"
        >
          <span className="text-sm font-medium text-low opacity-80">
            Actions
          </span>
        </button>
      </div>
    </CollapsibleSection>
  );
}
