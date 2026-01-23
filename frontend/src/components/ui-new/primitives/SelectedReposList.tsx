import { FolderSimpleIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { RepoCardSimple } from './RepoCardSimple';
import type { Repo, GitBranch } from 'shared/types';

interface SelectedReposListProps {
  repos: Repo[];
  onRemove: (repoId: string) => void;
  branchesByRepo?: Record<string, GitBranch[]>;
  selectedBranches?: Record<string, string | null>;
  onBranchChange?: (repoId: string, branch: string) => void;
}

export function SelectedReposList({
  repos,
  onRemove,
  branchesByRepo,
  selectedBranches,
  onBranchChange,
}: SelectedReposListProps) {
  const { t } = useTranslation('common');

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-base text-center">
        <FolderSimpleIcon
          className="size-icon-xl text-low mb-base"
          weight="duotone"
        />
        <p className="text-sm text-low">{t('repos.noReposAdded')}</p>
        <p className="text-xs text-low mt-half">
          {t('repos.noReposAddedHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-double p-base w-full overflow-x-hidden">
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
