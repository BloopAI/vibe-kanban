import { useCallback, useMemo, useState } from 'react';
import {
  GitBranchIcon,
  MagnifyingGlassIcon,
  NoteBlankIcon,
  PlusIcon,
  SpinnerIcon,
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

function getRepoDisplayName(repo: Repo): string {
  return repo.display_name || repo.name;
}

type PendingAction = 'choose' | 'browse' | 'create' | 'branch' | null;

export function CreateModeRepoPickerBar() {
  const { t } = useTranslation('common');
  const { repos, targetBranches, addRepo, removeRepo, setTargetBranch } =
    useCreateMode();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [branchRepoId, setBranchRepoId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const isBusy = pendingAction !== null;

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
        getRepoDisplayName(repo)
      ) as Record<string, SelectionPage>,
    })) as BranchSelectionResult | undefined;

    return branchResult?.branch ?? null;
  }, []);

  const runPickerAction = useCallback(
    async (
      action: Exclude<PendingAction, null>,
      run: () => Promise<void>,
      fallbackError: string
    ) => {
      setPickerError(null);
      setPendingAction(action);

      try {
        await run();
      } catch (error) {
        setPickerError(
          error instanceof Error ? error.message : fallbackError
        );
      } finally {
        setPendingAction(null);
        if (action === 'branch') {
          setBranchRepoId(null);
        }
      }
    },
    []
  );

  const addRepoWithBranchSelection = useCallback(
    async (repo: Repo) => {
      if (selectedRepoIds.has(repo.id)) {
        setPickerError('Repository is already selected');
        return false;
      }

      const selectedBranch = await pickBranchForRepo(repo);
      if (!selectedBranch) return false;

      addRepo(repo);
      setTargetBranch(repo.id, selectedBranch);
      return true;
    },
    [addRepo, pickBranchForRepo, selectedRepoIds, setTargetBranch]
  );

  const handleChooseRepo = useCallback(async () => {
    await runPickerAction(
      'choose',
      async () => {
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
          (repo) => repo.id === repoResult.repoId
        );
        if (!selectedRepo) return;

        await addRepoWithBranchSelection(selectedRepo);
      },
      'Failed to load repositories or branches'
    );
  }, [addRepoWithBranchSelection, runPickerAction, selectedRepoIds]);

  const handleBrowseRepo = useCallback(async () => {
    await runPickerAction(
      'browse',
      async () => {
        const selectedPath = await FolderPickerDialog.show({
          title: t('dialogs.selectGitRepository'),
          description: t('dialogs.chooseExistingRepo'),
        });
        if (!selectedPath) return;

        const repo = await repoApi.register({ path: selectedPath });
        await addRepoWithBranchSelection(repo);
      },
      'Failed to register repository'
    );
  }, [addRepoWithBranchSelection, runPickerAction, t]);

  const handleCreateRepo = useCallback(async () => {
    await runPickerAction(
      'create',
      async () => {
        const repo = await CreateRepoDialog.show();
        if (!repo) return;
        await addRepoWithBranchSelection(repo);
      },
      'Failed to create repository'
    );
  }, [addRepoWithBranchSelection, runPickerAction]);

  const handleChangeBranch = useCallback(
    async (repo: Repo) => {
      setBranchRepoId(repo.id);
      await runPickerAction(
        'branch',
        async () => {
          const selectedBranch = await pickBranchForRepo(repo);
          if (!selectedBranch) return;
          setTargetBranch(repo.id, selectedBranch);
        },
        'Failed to load branches'
      );
    },
    [pickBranchForRepo, runPickerAction, setTargetBranch]
  );

  return (
    <div className="w-chat max-w-full">
      <div className="rounded-sm border border-border bg-secondary p-base">
        <div className="flex items-start justify-between gap-base">
          <div className="min-w-0">
            <p className="text-sm font-medium text-high">
              {t('sections.repositories')}
            </p>
            <p className="text-xs text-low">
              {repos.length === 0
                ? 'Select at least one repository and branch to start.'
                : 'Review repository and branch selections before creating.'}
            </p>
          </div>
          {repos.length > 0 && (
            <span className="rounded-sm border border-border bg-panel px-half py-[1px] text-xs text-low shrink-0">
              {repos.length} selected
            </span>
          )}
        </div>

        {repos.length > 0 && (
          <div className="mt-base flex flex-wrap gap-half">
            {repos.map((repo) => {
              const branch = targetBranches[repo.id] ?? 'Select branch';
              const repoDisplayName = getRepoDisplayName(repo);
              const isChangingBranch =
                pendingAction === 'branch' && branchRepoId === repo.id;

              return (
                <div
                  key={repo.id}
                  className="inline-flex max-w-full items-center gap-half rounded-sm border border-border bg-panel px-base py-half text-sm"
                >
                  <span className="truncate max-w-[220px]" title={repo.path}>
                    {repoDisplayName}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleChangeBranch(repo)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-half rounded-sm border border-border px-half py-[1px] text-xs text-low hover:text-normal disabled:cursor-not-allowed disabled:opacity-50"
                    title="Change branch"
                  >
                    {isChangingBranch ? (
                      <SpinnerIcon className="h-3 w-3 animate-spin" />
                    ) : (
                      <GitBranchIcon className="h-3 w-3" weight="bold" />
                    )}
                    <span>{branch}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRepo(repo.id)}
                    disabled={isBusy}
                    className="text-low hover:text-normal disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Remove ${repoDisplayName}`}
                  >
                    <XIcon className="h-3 w-3" weight="bold" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-base flex flex-wrap gap-half border-t border-border pt-base">
          <PrimaryButton
            variant="default"
            value={repos.length === 0 ? 'Choose repo' : 'Add repo'}
            actionIcon={pendingAction === 'choose' ? 'spinner' : PlusIcon}
            onClick={handleChooseRepo}
            disabled={isBusy}
          />
          <PrimaryButton
            variant="tertiary"
            value={t('actions.browseRepos')}
            actionIcon={
              pendingAction === 'browse' ? 'spinner' : MagnifyingGlassIcon
            }
            onClick={handleBrowseRepo}
            disabled={isBusy}
          />
          <PrimaryButton
            variant="tertiary"
            value={t('actions.createNewRepo')}
            actionIcon={pendingAction === 'create' ? 'spinner' : NoteBlankIcon}
            onClick={handleCreateRepo}
            disabled={isBusy}
          />
        </div>
      </div>
      {pickerError && (
        <div className="mt-half rounded-sm border border-error/30 bg-error/10 px-base py-half">
          <p className="text-xs text-error">{pickerError}</p>
        </div>
      )}
    </div>
  );
}
