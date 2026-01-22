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

  console.log('[CreateModeReposSectionContainer] render', {
    repoIds: repos.map((r) => r.id),
    targetBranches,
  });

  const repoIds = useMemo(() => repos.map((r) => r.id), [repos]);
  const { branchesByRepo } = useMultiRepoBranches(repoIds);

  useEffect(() => {
    console.log('[CreateModeReposSectionContainer] auto-select effect', {
      repoIds: repos.map((r) => r.id),
      targetBranches,
      branchesByRepoKeys: Object.keys(branchesByRepo),
    });
    repos.forEach((repo) => {
      const branches = branchesByRepo[repo.id];
      if (branches && !targetBranches[repo.id]) {
        const currentBranch = branches.find((b) => b.is_current);
        console.log(
          '[CreateModeReposSectionContainer] SETTING branch for',
          repo.id,
          'to',
          currentBranch?.name
        );
        if (currentBranch) {
          setTargetBranch(repo.id, currentBranch.name);
        }
      } else if (branches) {
        console.log(
          '[CreateModeReposSectionContainer] SKIPPING',
          repo.id,
          'already has:',
          targetBranches[repo.id]
        );
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
