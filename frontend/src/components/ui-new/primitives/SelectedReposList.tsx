import { FolderSimpleIcon } from '@phosphor-icons/react';
import { RepoCardSimple } from './RepoCardSimple';
import type { Repo } from 'shared/types';

interface SelectedReposListProps {
  repos: Repo[];
  onRemove: (repoId: string) => void;
}

export function SelectedReposList({ repos, onRemove }: SelectedReposListProps) {
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
    <div className="flex flex-col gap-base">
      {repos.map((repo) => (
        <RepoCardSimple
          key={repo.id}
          name={repo.display_name || repo.name}
          path={repo.path}
          onRemove={() => onRemove(repo.id)}
        />
      ))}
    </div>
  );
}
