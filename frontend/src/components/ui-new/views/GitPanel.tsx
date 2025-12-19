import { GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { RepoCard } from '@/components/ui-new/primitives/RepoCard';
import { EditableText } from '@/components/ui-new/primitives/EditableText';

export interface RepoInfo {
  id: string;
  name: string;
  currentBranch: string;
  commitsAhead: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

interface GitPanelProps {
  repos: RepoInfo[];
  workingBranchName: string;
  onWorkingBranchNameChange: (name: string) => void;
  onActionsClick?: (repoId: string) => void;
  onAddRepo?: () => void;
  className?: string;
}

export function GitPanel({
  repos,
  workingBranchName,
  onWorkingBranchNameChange,
  onActionsClick,
  onAddRepo,
  className,
}: GitPanelProps) {
  return (
    <div
      className={cn(
        'w-full h-full flex-1 flex flex-col justify-between p-double bg-secondary',
        className
      )}
    >
      {/* Main content area */}
      <div className="flex flex-col gap-double">
        {/* Rename Working Branch input */}
        <div className="flex flex-col gap-base w-full">
          <div className="flex gap-base items-center">
            <GitBranchIcon className="size-icon-base text-base" weight="fill" />
            <p className="text-base text-normal">Working Branch</p>
          </div>
          <EditableText
            value={workingBranchName}
            onChange={onWorkingBranchNameChange}
            placeholder="e.g acme Corp"
          />
        </div>

        {/* Repo cards list */}
        <div className="flex flex-col gap-base">
          {repos.map((repo) => (
            <RepoCard
              key={repo.id}
              name={repo.name}
              currentBranch={repo.currentBranch}
              commitsAhead={repo.commitsAhead}
              filesChanged={repo.filesChanged}
              linesAdded={repo.linesAdded}
              linesRemoved={repo.linesRemoved}
              onActionsClick={() => onActionsClick?.(repo.id)}
            />
          ))}
        </div>
      </div>

      {/* Add button at bottom */}
      <div className="flex gap-base">
        <button
          type="button"
          onClick={onAddRepo}
          className="flex-1 flex items-center justify-center bg-panel rounded-sm p-base text-low hover:text-normal"
        >
          <PlusIcon className="size-icon-xs" weight="bold" />
        </button>
      </div>
    </div>
  );
}
