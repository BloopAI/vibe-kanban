import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  ClockCounterClockwiseIcon,
  FolderSimpleIcon,
  GitBranchIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SpinnerIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type { Project, Repo } from 'shared/types';
import type { BranchItem, RepoItem } from '@/shared/types/selectionItems';
import { projectsApi, repoApi } from '@/shared/lib/api';
import { cn } from '@/shared/lib/utils';
import { useCreateMode } from '@/features/create-mode/model/useCreateMode';
import { FolderPickerDialog } from '@/shared/dialogs/shared/FolderPickerDialog';
import { SettingsDialog } from '@/shared/dialogs/settings/SettingsDialog';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import { CreateRepoDialog } from '@vibe/ui/components/CreateRepoDialog';
import {
  SelectionDialog,
  type SelectionPage,
} from '@/shared/dialogs/command-bar/SelectionDialog';
import {
  buildRepoSelectionPages,
  type RepoSelectionResult,
} from '@/shared/dialogs/command-bar/selections/repoSelection';
import {
  buildBranchSelectionPages,
  type BranchSelectionResult,
} from '@/shared/dialogs/command-bar/selections/branchSelection';

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

type PendingAction =
  | 'choose'
  | 'browse'
  | 'create'
  | 'branch'
  | 'scan'
  | 'project'
  | null;

const inlineControlButtonClassName =
  'inline-flex items-center gap-half rounded-sm px-half py-half text-sm text-normal ' +
  'hover:text-high disabled:cursor-not-allowed disabled:opacity-50';

const recentInlineControlButtonClassName =
  'inline-flex items-center gap-half rounded-sm px-half py-half text-sm ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const repoRowButtonClassName =
  'inline-flex items-center gap-half text-sm text-low hover:text-high ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

interface CreateModeRepoPickerBarProps {
  onContinueToPrompt: () => void;
}

export function CreateModeRepoPickerBar({
  onContinueToPrompt,
}: CreateModeRepoPickerBarProps) {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const {
    repos,
    targetBranches,
    addRepo,
    removeRepo,
    setTargetBranch,
    projectId,
    setProjectId,
    workspaceName,
    setWorkspaceName,
    workspaceBranch,
    setWorkspaceBranch,
    setReposWithBranches,
  } = useCreateMode();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [branchRepoId, setBranchRepoId] = useState<string | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [setupHintDismissed, setSetupHintDismissed] = useState(false);
  const isBusy = pendingAction !== null;

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
    staleTime: 30_000,
  });

  const selectedProject = useMemo(
    () => (projectId ? projects?.find((p) => p.id === projectId) : null),
    [projectId, projects]
  );

  // When a project is selected, load its associated repos with their UAT
  // branches and pre-populate the workspace's repo selection. This only fires
  // once per project change so we don't overwrite manual edits.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setPickerError(null);
    (async () => {
      try {
        const projectRepos = await projectsApi.listRepos(projectId);
        if (cancelled) return;
        const entries = projectRepos.map((entry) => {
          const { uat_branch: uatBranch, ...repo } = entry;
          return {
            repo: repo as Repo,
            targetBranch: uatBranch ?? entry.default_target_branch ?? null,
          };
        });
        setReposWithBranches(entries);
      } catch (err) {
        if (!cancelled) {
          setPickerError(
            err instanceof Error
              ? err.message
              : 'Failed to load project repositories'
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setReposWithBranches]);

  const hasUnconfiguredRepo = useMemo(
    () => repos.some((repo) => !repo.setup_script),
    [repos]
  );
  const showSetupHint = hasUnconfiguredRepo && !setupHintDismissed;

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
        setPickerError(error instanceof Error ? error.message : fallbackError);
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
        const allRepos = await repoApi.listRecent();
        const availableRepos = allRepos.filter(
          (repo) => !selectedRepoIds.has(repo.id)
        );

        if (availableRepos.length === 0) {
          setPickerError(
            'No recently used repositories found, please browse repositories instead'
          );
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
        queryClient.invalidateQueries({ queryKey: ['repos'] });
        await addRepoWithBranchSelection(repo);
      },
      'Failed to register repository'
    );
  }, [addRepoWithBranchSelection, runPickerAction, t]);

  const handleCreateRepo = useCallback(async () => {
    await runPickerAction(
      'create',
      async () => {
        await CreateRepoDialog.show({
          onBrowseForPath: async (currentPath) =>
            FolderPickerDialog.show({
              title: t('git.createRepo.browseDialog.title'),
              description: t('git.createRepo.browseDialog.description'),
              value: currentPath,
            }),
          onCreateRepo: async ({ parentPath, folderName }) => {
            const repo = await repoApi.init({
              parent_path: parentPath,
              folder_name: folderName,
            });
            queryClient.invalidateQueries({ queryKey: ['repos'] });
            await addRepoWithBranchSelection(repo);
          },
        });
      },
      'Failed to create repository'
    );
  }, [addRepoWithBranchSelection, runPickerAction, t]);

  const handleScanDirectory = useCallback(async () => {
    await runPickerAction(
      'scan',
      async () => {
        const selectedPath = await FolderPickerDialog.show({
          title: t('dialogs.selectGitRepository'),
          description: t('dialogs.chooseExistingRepo'),
        });
        if (!selectedPath) return;

        const { repos: discovered } = await repoApi.scanDirectory({
          path: selectedPath,
          max_depth: 4,
        });
        if (discovered.length === 0) {
          setPickerError(`No git repositories found under ${selectedPath}`);
          return;
        }

        const { registered, failed } = await repoApi.bulkRegister({
          paths: discovered.map((r) => r.path),
        });
        queryClient.invalidateQueries({ queryKey: ['repos'] });

        for (const repo of registered) {
          if (selectedRepoIds.has(repo.id)) continue;
          addRepo(repo);
          const fallbackBranch = repo.default_target_branch;
          if (fallbackBranch) {
            setTargetBranch(repo.id, fallbackBranch);
          }
        }

        if (failed.length > 0) {
          setPickerError(
            `Imported ${registered.length} repositories. ${failed.length} failed: ${failed
              .map((f) => `${f.path} (${f.error})`)
              .join('; ')}`
          );
        }
      },
      'Failed to scan directory for git repositories'
    );
  }, [
    addRepo,
    queryClient,
    runPickerAction,
    selectedRepoIds,
    setTargetBranch,
    t,
  ]);

  const handlePickProject = useCallback(async () => {
    setPickerError(null);
    setPendingAction('project');
    try {
      const list = (projects ?? (await projectsApi.list())).slice();
      list.sort((a, b) => a.name.localeCompare(b.name));

      const projectItems: RepoItem[] = list.map((p: Project) => ({
        id: p.id,
        display_name: p.name,
      }));

      const result = (await SelectionDialog.show({
        initialPageId: 'selectRepo',
        pages: buildRepoSelectionPages(projectItems) as Record<
          string,
          SelectionPage
        >,
      })) as RepoSelectionResult | undefined;

      if (!result?.repoId) return;
      setProjectId(result.repoId);
    } catch (err) {
      setPickerError(
        err instanceof Error ? err.message : 'Failed to load projects'
      );
    } finally {
      setPendingAction(null);
    }
  }, [projects, setProjectId]);

  const handleClearProject = useCallback(() => {
    setProjectId(null);
  }, [setProjectId]);

  const handleCreateProject = useCallback(async () => {
    const name = window.prompt('New project name')?.trim();
    if (!name) return;
    setPickerError(null);
    try {
      const project = await projectsApi.create({ name });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectId(project.id);
    } catch (err) {
      setPickerError(
        err instanceof Error ? err.message : 'Failed to create project'
      );
    }
  }, [queryClient, setProjectId]);

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
      <div className="px-plusfifty py-base">
        <div className="mb-base flex flex-col gap-half">
          <div className="flex items-center gap-half">
            <span className="text-xs uppercase tracking-wide text-low w-24 shrink-0">
              项目
            </span>
            <div className="flex flex-1 flex-wrap items-center gap-half">
              {selectedProject ? (
                <>
                  <span className="rounded-sm border border-border/60 px-half py-half text-sm text-normal">
                    {selectedProject.name}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearProject}
                    disabled={isBusy}
                    className={cn(repoRowButtonClassName, 'hover:text-error')}
                    title="清除关联项目"
                    aria-label="Clear project"
                  >
                    <XIcon className="size-icon-2xs" weight="bold" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handlePickProject}
                  disabled={isBusy}
                  className={inlineControlButtonClassName}
                >
                  {pendingAction === 'project' ? (
                    <SpinnerIcon className="size-icon-xs animate-spin" />
                  ) : (
                    <PlusIcon className="size-icon-xs" weight="bold" />
                  )}
                  <span>选择项目</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={isBusy}
                className={inlineControlButtonClassName}
              >
                <PlusIcon className="size-icon-xs" weight="bold" />
                <span>新建项目</span>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-half">
            <span className="text-xs uppercase tracking-wide text-low w-24 shrink-0">
              工作区名称
            </span>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="留空则使用提示词第一行"
              disabled={isBusy}
              className="flex-1 rounded-sm border border-border/60 bg-transparent px-half py-half text-sm text-normal placeholder:text-low/70 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          <label className="flex items-center gap-half">
            <span className="text-xs uppercase tracking-wide text-low w-24 shrink-0">
              工作区分支
            </span>
            <input
              type="text"
              value={workspaceBranch}
              onChange={(e) => setWorkspaceBranch(e.target.value)}
              placeholder="留空则按工作区名自动生成"
              disabled={isBusy}
              className="flex-1 rounded-sm border border-border/60 bg-transparent px-half py-half font-mono text-sm text-normal placeholder:text-low/70 focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
        </div>

        {repos.length > 0 && (
          <div>
            <div className="rounded-sm border border-border/60">
              {repos.map((repo, index) => {
                const branch = targetBranches[repo.id] ?? 'Select branch';
                const repoDisplayName = getRepoDisplayName(repo);
                const isChangingBranch =
                  pendingAction === 'branch' && branchRepoId === repo.id;

                return (
                  <div
                    key={repo.id}
                    className={cn(
                      'flex min-w-0 items-center gap-half px-base py-half',
                      index > 0 && 'border-t border-border/60'
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-normal">
                      {repoDisplayName}
                    </span>
                    <span className="h-3 w-px shrink-0 bg-border/70" />
                    <button
                      type="button"
                      onClick={() => handleChangeBranch(repo)}
                      disabled={isBusy}
                      className={repoRowButtonClassName}
                      title="Change branch"
                    >
                      {isChangingBranch ? (
                        <SpinnerIcon className="size-icon-xs animate-spin" />
                      ) : (
                        <GitBranchIcon className="size-icon-xs" weight="bold" />
                      )}
                      <span className="max-w-[200px] truncate">{branch}</span>
                    </button>
                    <span className="h-3 w-px shrink-0 bg-border/70" />
                    <button
                      type="button"
                      onClick={() => removeRepo(repo.id)}
                      disabled={isBusy}
                      aria-label={`Remove ${repoDisplayName}`}
                      title={`Remove ${repoDisplayName}`}
                      className={cn(repoRowButtonClassName, 'hover:text-error')}
                    >
                      <XIcon className="size-icon-xs" weight="bold" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-base flex flex-wrap items-center gap-half">
          <button
            type="button"
            onClick={handleChooseRepo}
            disabled={isBusy}
            className={cn(
              recentInlineControlButtonClassName,
              repos.length > 0
                ? 'text-normal hover:text-high'
                : 'text-brand hover:text-brand-hover'
            )}
          >
            {pendingAction === 'choose' ? (
              <SpinnerIcon className="size-icon-xs animate-spin" />
            ) : (
              <ClockCounterClockwiseIcon
                className="size-icon-xs"
                weight="bold"
              />
            )}
            <span>{t('createMode.repoPicker.actions.recent')}</span>
          </button>
          <button
            type="button"
            onClick={handleBrowseRepo}
            disabled={isBusy}
            className={inlineControlButtonClassName}
          >
            {pendingAction === 'browse' ? (
              <SpinnerIcon className="size-icon-xs animate-spin" />
            ) : (
              <MagnifyingGlassIcon className="size-icon-xs" weight="bold" />
            )}
            <span>{t('createMode.repoPicker.actions.browse')}</span>
          </button>
          <button
            type="button"
            onClick={handleCreateRepo}
            disabled={isBusy}
            className={inlineControlButtonClassName}
          >
            {pendingAction === 'create' ? (
              <SpinnerIcon className="size-icon-xs animate-spin" />
            ) : (
              <PlusIcon className="size-icon-xs" weight="bold" />
            )}
            <span>{t('createMode.repoPicker.actions.create')}</span>
          </button>
          <button
            type="button"
            onClick={handleScanDirectory}
            disabled={isBusy}
            className={inlineControlButtonClassName}
            title="扫描目录批量导入 git 仓库"
          >
            {pendingAction === 'scan' ? (
              <SpinnerIcon className="size-icon-xs animate-spin" />
            ) : (
              <FolderSimpleIcon className="size-icon-xs" weight="bold" />
            )}
            <span>扫描目录</span>
          </button>

          <div className="ml-auto">
            <PrimaryButton
              variant="default"
              value="Continue"
              onClick={onContinueToPrompt}
              disabled={isBusy || repos.length === 0}
            />
          </div>
        </div>
      </div>
      {showSetupHint && (
        <div className="mx-plusfifty mt-half flex items-start gap-half rounded-sm border border-brand/20 bg-brand/5 px-base py-base">
          <div className="flex-1">
            <p className="text-sm font-medium text-normal">
              {t('createMode.repoPicker.setupHintTitle')}
            </p>
            <p className="mt-quarter text-sm text-low">
              {t('createMode.repoPicker.setupHint')}
            </p>
            <button
              type="button"
              className="mt-quarter cursor-pointer text-sm font-medium text-brand underline hover:text-brand/80"
              onClick={() => {
                const unconfiguredRepo = repos.find(
                  (repo) => !repo.setup_script
                );
                SettingsDialog.show({
                  initialSection: 'repos',
                  initialState: { repoId: unconfiguredRepo?.id },
                });
              }}
            >
              {t('createMode.repoPicker.setupHintLink')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSetupHintDismissed(true)}
            className="shrink-0 text-low hover:text-normal"
            aria-label={t('createMode.repoPicker.setupHintDismiss')}
          >
            <XIcon className="size-icon-2xs" weight="bold" />
          </button>
        </div>
      )}
      {pickerError && (
        <div className="mt-half rounded-sm border border-error/30 bg-error/10 px-base py-half">
          <p className="text-xs text-error">{pickerError}</p>
        </div>
      )}
    </div>
  );
}
