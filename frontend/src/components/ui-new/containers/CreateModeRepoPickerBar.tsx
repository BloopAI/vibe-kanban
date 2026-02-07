import { useCallback, useMemo, useState } from 'react';
import { GitBranchIcon, PlusIcon, XIcon } from '@phosphor-icons/react';
import type { Repo } from 'shared/types';
import type { BranchItem, RepoItem } from '@/components/ui-new/actions/pages';
import { repoApi } from '@/lib/api';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { SelectionDialog, type SelectionPage } from '../dialogs/SelectionDialog';
import {
  buildRepoSelectionPages,
  type RepoSelectionResult,
} from '../dialogs/selections/repoSelection';
import {
  buildBranchSelectionPages,
  type BranchSelectionResult,
} from '../dialogs/selections/branchSelection';

function toRepoItem(repo: Repo): RepoItem {
  return {
    id: repo.id,
    display_name: repo.display_name || repo.name,
  };
}

function toBranchItem(branch: { name: string; is_current: boolean }): BranchItem {
  return {
    name: branch.name,
    isCurrent: branch.is_current,
  };
}

export function CreateModeRepoPickerBar() {
  const { repos, targetBranches, addRepo, removeRepo, setTargetBranch } =
    useCreateMode();
  const [isPicking, setIsPicking] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  const selectedRepoIds = useMemo(
    () => new Set(repos.map((repo) => repo.id)),
    [repos]
  );

  const pickBranchForRepo = useCallback(async (repo: Repo) => {
    const branches = await repoApi.getBranches(repo.id);
    const branchItems = branches.map(toBranchItem);
    const branchResult = (await SelectionDialog.show({
      initialPageId: 'selectBranch',
      pages: buildBranchSelectionPages(
        branchItems,
        repo.display_name || repo.name
      ) as Record<string, SelectionPage>,
    })) as BranchSelectionResult | undefined;

    return branchResult?.branch ?? null;
  }, []);

  const handleChooseRepo = useCallback(async () => {
    setPickerError(null);
    setIsPicking(true);

    try {
      const allRepos = await repoApi.list();
      const availableRepos = allRepos.filter(
        (repo) => !selectedRepoIds.has(repo.id)
      );

      if (availableRepos.length === 0) {
        setPickerError('All repositories have already been added');
        return;
      }

      const repoResult = (await SelectionDialog.show({
        initialPageId: 'selectRepo',
        pages: buildRepoSelectionPages(
          availableRepos.map(toRepoItem)
        ) as Record<string, SelectionPage>,
      })) as RepoSelectionResult | undefined;

      if (!repoResult?.repoId) return;

      const selectedRepo = availableRepos.find((r) => r.id === repoResult.repoId);
      if (!selectedRepo) return;

      const selectedBranch = await pickBranchForRepo(selectedRepo);
      if (!selectedBranch) return;

      addRepo(selectedRepo);
      setTargetBranch(selectedRepo.id, selectedBranch);
    } catch (error) {
      setPickerError(
        error instanceof Error
          ? error.message
          : 'Failed to load repositories or branches'
      );
    } finally {
      setIsPicking(false);
    }
  }, [addRepo, pickBranchForRepo, selectedRepoIds, setTargetBranch]);

  const handleChangeBranch = useCallback(
    async (repo: Repo) => {
      setPickerError(null);
      setIsPicking(true);

      try {
        const selectedBranch = await pickBranchForRepo(repo);
        if (!selectedBranch) return;
        setTargetBranch(repo.id, selectedBranch);
      } catch (error) {
        setPickerError(
          error instanceof Error ? error.message : 'Failed to load branches'
        );
      } finally {
        setIsPicking(false);
      }
    },
    [pickBranchForRepo, setTargetBranch]
  );

  return (
    <div className="w-chat max-w-full">
      <div className="rounded-sm border border-border bg-secondary p-base">
        <div className="flex flex-wrap items-center gap-half">
          {repos.map((repo) => {
            const branch = targetBranches[repo.id] ?? 'main';
            return (
              <div
                key={repo.id}
                className="inline-flex max-w-full items-center gap-half rounded-sm border border-border bg-panel px-half py-half text-sm"
              >
                <span className="truncate max-w-[220px]">
                  {repo.display_name || repo.name}
                </span>
                <button
                  type="button"
                  onClick={() => handleChangeBranch(repo)}
                  disabled={isPicking}
                  className="inline-flex items-center gap-half rounded-sm border border-border px-half py-[1px] text-xs text-low hover:text-normal disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <GitBranchIcon className="h-3 w-3" weight="bold" />
                  <span>{branch}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removeRepo(repo.id)}
                  disabled={isPicking}
                  className="text-low hover:text-normal disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Remove ${repo.display_name || repo.name}`}
                >
                  <XIcon className="h-3 w-3" weight="bold" />
                </button>
              </div>
            );
          })}

          <PrimaryButton
            variant="tertiary"
            value={repos.length === 0 ? 'Choose repo' : 'Add repo'}
            actionIcon={isPicking ? 'spinner' : PlusIcon}
            onClick={handleChooseRepo}
            disabled={isPicking}
          />
        </div>
        {repos.length === 0 && (
          <p className="mt-half text-xs text-low">
            Pick at least one repository to continue.
          </p>
        )}
      </div>
      {pickerError && <p className="mt-half text-xs text-error">{pickerError}</p>}
    </div>
  );
}
