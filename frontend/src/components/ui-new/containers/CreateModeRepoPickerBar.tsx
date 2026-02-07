import { useCallback, useMemo, useState } from 'react';
import {
  GitBranchIcon,
  MagnifyingGlassIcon,
  NoteBlankIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Repo } from 'shared/types';
import type { BranchItem, RepoItem } from '@/components/ui-new/actions/pages';
import { repoApi } from '@/lib/api';
import { useCreateMode } from '@/contexts/CreateModeContext';
import { FolderPickerDialog } from '@/components/dialogs/shared/FolderPickerDialog';
import { PrimaryButton } from '@/components/ui-new/primitives/PrimaryButton';
import { CreateRepoDialog } from '@/components/ui-new/dialogs/CreateRepoDialog';
import {
  SelectionDialog,
  type SelectionPage,
} from '../dialogs/SelectionDialog';
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

function toBranchItem(branch: {
  name: string;
  is_current: boolean;
}): BranchItem {
  return {
    name: branch.name,
    isCurrent: branch.is_current,
  };
}

export function CreateModeRepoPickerBar() {
  const { t } = useTranslation('common');
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

  const addRepoWithBranchSelection = useCallback(
    async (repo: Repo) => {
      if (selectedRepoIds.has(repo.id)) {
        setPickerError('Repository is already selected');
        return;
      }

      const selectedBranch = await pickBranchForRepo(repo);
      if (!selectedBranch) return;

      addRepo(repo);
      setTargetBranch(repo.id, selectedBranch);
    },
    [addRepo, pickBranchForRepo, selectedRepoIds, setTargetBranch]
  );

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

      const selectedRepo = availableRepos.find(
        (r) => r.id === repoResult.repoId
      );
      if (!selectedRepo) return;

      await addRepoWithBranchSelection(selectedRepo);
    } catch (error) {
      setPickerError(
        error instanceof Error
          ? error.message
          : 'Failed to load repositories or branches'
      );
    } finally {
      setIsPicking(false);
    }
  }, [addRepoWithBranchSelection, selectedRepoIds]);

  const handleBrowseRepo = useCallback(async () => {
    setPickerError(null);
    setIsPicking(true);

    try {
      const selectedPath = await FolderPickerDialog.show({
        title: t('dialogs.selectGitRepository'),
        description: t('dialogs.chooseExistingRepo'),
      });
      if (!selectedPath) return;

      const repo = await repoApi.register({ path: selectedPath });
      await addRepoWithBranchSelection(repo);
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : 'Failed to register repository'
      );
    } finally {
      setIsPicking(false);
    }
  }, [addRepoWithBranchSelection, t]);

  const handleCreateRepo = useCallback(async () => {
    setPickerError(null);
    setIsPicking(true);

    try {
      const repo = await CreateRepoDialog.show();
      if (!repo) return;
      await addRepoWithBranchSelection(repo);
    } catch (error) {
      setPickerError(
        error instanceof Error ? error.message : 'Failed to create repository'
      );
    } finally {
      setIsPicking(false);
    }
  }, [addRepoWithBranchSelection]);

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
          <PrimaryButton
            variant="tertiary"
            value={t('actions.browseRepos')}
            actionIcon={isPicking ? 'spinner' : MagnifyingGlassIcon}
            onClick={handleBrowseRepo}
            disabled={isPicking}
          />
          <PrimaryButton
            variant="tertiary"
            value={t('actions.createNewRepo')}
            actionIcon={isPicking ? 'spinner' : NoteBlankIcon}
            onClick={handleCreateRepo}
            disabled={isPicking}
          />
        </div>
        {repos.length === 0 && (
          <p className="mt-half text-xs text-low">
            Pick at least one repository to continue.
          </p>
        )}
      </div>
      {pickerError && (
        <p className="mt-half text-xs text-error">{pickerError}</p>
      )}
    </div>
  );
}
