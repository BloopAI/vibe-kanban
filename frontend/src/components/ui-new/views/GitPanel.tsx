import { GitBranchIcon, PlusIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { RepoCard } from '@/components/ui-new/primitives/RepoCard';
import { InputField } from '@/components/ui-new/primitives/InputField';
import { SectionHeader } from '@/components/ui-new/primitives/SectionHeader';

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
        'w-full h-full bg-secondary flex flex-col gap-double pt-double px-double text-low',
        className
      )}
    >
      <SectionHeader
        title="Repositories"
        icon={PlusIcon}
        onIconClick={onAddRepo}
      />
      <div className="flex flex-col gap-base w-full">
        <div className="flex gap-base items-center">
          <GitBranchIcon className="size-icon-base text-base" weight="fill" />
          <p className="text-base">Working Branch</p>
        </div>
        <InputField
          variant="editable"
          value={workingBranchName}
          onChange={onWorkingBranchNameChange}
          placeholder="e.g acme Corp"
        />
      </div>
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
  );
}
