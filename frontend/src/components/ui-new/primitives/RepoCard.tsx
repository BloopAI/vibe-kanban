import { useState } from 'react';
import {
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  ArrowsClockwiseIcon,
  FileTextIcon,
  ArrowUpIcon,
  CrosshairIcon,
  ArrowRightIcon,
} from '@phosphor-icons/react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './Dropdown';
import { CollapsibleSection } from './CollapsibleSection';
import { SplitButton, type SplitButtonOption } from './SplitButton';

export type RepoAction = 'pull-request' | 'merge' | 'change-target' | 'rebase';

const repoActionOptions: SplitButtonOption<RepoAction>[] = [
  {
    value: 'pull-request',
    label: 'Open pull request',
    icon: GitPullRequestIcon,
  },
  { value: 'merge', label: 'Merge', icon: GitMergeIcon },
];

interface RepoCardProps {
  name: string;
  targetBranch: string;
  commitsAhead?: number;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  branchDropdownContent?: React.ReactNode;
  onChangeTarget?: () => void;
  onRebase?: () => void;
  onActionsClick?: (action: RepoAction) => void;
}

export function RepoCard({
  name,
  targetBranch,
  commitsAhead = 0,
  filesChanged = 0,
  linesAdded,
  linesRemoved,
  branchDropdownContent,
  onChangeTarget,
  onRebase,
  onActionsClick,
}: RepoCardProps) {
  const [selectedAction, setSelectedAction] =
    useState<RepoAction>('pull-request');

  return (
    <CollapsibleSection title={name} className="gap-base" defaultExpanded>
      {/* Branch row */}
      <div className="flex items-center gap-base">
        <div className="flex items-center justify-center">
          <GitBranchIcon className="size-icon-base text-base" weight="fill" />
        </div>
        <div className="flex items-center justify-center">
          <ArrowRightIcon className="size-icon-sm text-low" weight="bold" />
        </div>
        <div className="flex items-center justify-center">
          <CrosshairIcon className="size-icon-sm text-low" weight="bold" />
        </div>
        <div className="flex-1 min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger label={targetBranch} className="max-w-full" />
            <DropdownMenuContent>
              {branchDropdownContent ?? (
                <>
                  <DropdownMenuItem
                    icon={CrosshairIcon}
                    onClick={onChangeTarget}
                  >
                    Change target
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    icon={ArrowsClockwiseIcon}
                    onClick={onRebase}
                  >
                    Rebase
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

      {/* Actions split button */}
      <SplitButton
        options={repoActionOptions}
        selectedValue={selectedAction}
        onSelectionChange={setSelectedAction}
        onAction={(action) => onActionsClick?.(action)}
      />
    </CollapsibleSection>
  );
}
