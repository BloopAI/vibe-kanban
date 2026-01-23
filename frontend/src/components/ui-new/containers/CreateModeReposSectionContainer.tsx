import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { WarningIcon } from '@phosphor-icons/react';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { useMultiRepoBranches } from '@/hooks/useRepoBranches';
import { SelectedReposList } from '@/components/ui-new/primitives/SelectedReposList';

export function CreateModeReposSectionContainer() {
  const { t } = useTranslation(['tasks']);
  const { repos, removeRepo, targetBranches, setTargetBranch } =
    useCreateMode();

  const repoIds = useMemo(() => repos.map((r) => r.id), [repos]);
  const { branchesByRepo } = useMultiRepoBranches(repoIds);

  // Auto-select branch for repos that don't have one set
  // (e.g., repos added by user after initialization)
  useEffect(() => {
    repos.forEach((repo) => {
      const branches = branchesByRepo[repo.id];
      // Only auto-select if branch is empty (not already set)
      if (branches && !targetBranches[repo.id]) {
        if (
          repo.default_target_branch &&
          branches.some((b) => b.name === repo.default_target_branch)
        ) {
          setTargetBranch(repo.id, repo.default_target_branch);
        } else {
          const currentBranch = branches.find((b) => b.is_current);
          if (currentBranch) {
            setTargetBranch(repo.id, currentBranch.name);
          }
        }
      }
    });
  }, [repos, branchesByRepo, targetBranches, setTargetBranch]);

  if (repos.length === 0) {
    return (
      <div className="p-base">
        <div className="flex items-center gap-2 p-base rounded bg-warning/10 border border-warning/20">
          <WarningIcon className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning">
            {t('gitPanel.create.warnings.noReposSelected')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SelectedReposList
      repos={repos}
      onRemove={removeRepo}
      branchesByRepo={branchesByRepo}
      selectedBranches={targetBranches}
      onBranchChange={setTargetBranch}
    />
  );
}
