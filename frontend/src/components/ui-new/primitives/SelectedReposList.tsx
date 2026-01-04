import { FolderSimpleIcon } from '@phosphor-icons/react';
import { RepoCardSimple } from './RepoCardSimple';
import type { Repo, GitBranch } from 'shared/types';

interface SelectedReposListProps {
  repos: Repo[];
  onRemove: (repoId: string) => void;
  branchesByRepo?: Record<string, GitBranch[]>;
  selectedBranches?: Record<string, string>;
  onBranchChange?: (repoId: string, branch: string) => void;
}

export function SelectedReposList({
  repos,
  onRemove,
  branchesByRepo,
  selectedBranches,
  onBranchChange,
}: SelectedReposListProps) {
  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-double text-center">
        <FolderSimpleIcon
          className="size-icon-xl text-low mb-base"
          weight="duotone"
        />
        <p className="text-sm text-low">No repositories added</p>
        <p className="text-xs text-low mt-half">
          Add one or more repositories to this workspace from the options below
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-double">
      {repos.map((repo) => (
        <RepoCardSimple
          key={repo.id}
          name={repo.display_name || repo.name}
          path={repo.path}
          onRemove={() => onRemove(repo.id)}
          branches={branchesByRepo?.[repo.id]}
          selectedBranch={selectedBranches?.[repo.id]}
          onBranchChange={
            onBranchChange
              ? (branch: string) => onBranchChange(repo.id, branch)
              : undefined
          }
        />
      ))}
    </div>
  );
}
