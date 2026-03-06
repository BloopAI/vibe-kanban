import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { GitBranchIcon, PlusIcon, SpinnerIcon } from '@phosphor-icons/react';
import { Loader2 } from 'lucide-react';
import { create, useModal } from '@ebay/nice-modal-react';
import { useRepoBranches } from '@/shared/hooks/useRepoBranches';
import { useScriptPlaceholders } from '@/shared/hooks/useScriptPlaceholders';
import { useAllOrganizationProjects } from '@/shared/hooks/useAllOrganizationProjects';
import { getProjectRepoDefaults } from '@/shared/hooks/useProjectRepoDefaults';
import { repoApi, ApiError } from '@/shared/lib/api';
import { defineModal } from '@/shared/lib/modals';
import type { Repo, UpdateRepo } from 'shared/types';
import { SearchableDropdownContainer } from '@/shared/components/ui-new/containers/SearchableDropdownContainer';
import { FolderPickerDialog } from '@/shared/dialogs/shared/FolderPickerDialog';
import { Button } from '@vibe/ui/components/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@vibe/ui/components/KeyboardDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '@vibe/ui/components/Dropdown';
import { PrimaryButton } from '@vibe/ui/components/PrimaryButton';
import {
  SettingsCard,
  SettingsField,
  SettingsInput,
  SettingsTextarea,
  SettingsCheckbox,
  SettingsSaveBar,
} from './SettingsComponents';

interface RepoScriptsFormState {
  display_name: string;
  default_working_dir: string;
  default_target_branch: string;
  setup_script: string;
  parallel_setup_script: boolean;
  cleanup_script: string;
  archive_script: string;
  copy_files: string;
  dev_server_script: string;
}

function repoToFormState(repo: Repo): RepoScriptsFormState {
  return {
    display_name: repo.display_name,
    default_working_dir: repo.default_working_dir ?? '',
    default_target_branch: repo.default_target_branch ?? '',
    setup_script: repo.setup_script ?? '',
    parallel_setup_script: repo.parallel_setup_script,
    cleanup_script: repo.cleanup_script ?? '',
    archive_script: repo.archive_script ?? '',
    copy_files: repo.copy_files ?? '',
    dev_server_script: repo.dev_server_script ?? '',
  };
}

// ── Remove Repo confirmation dialog ──────────────────────────────────
interface RemoveRepoDialogProps {
  repoName: string;
}

type RemoveRepoResult = 'removed' | 'canceled';

const RemoveRepoDialogImpl = create<RemoveRepoDialogProps>(({ repoName }) => {
  const modal = useModal();
  const { t } = useTranslation(['settings', 'common']);

  const handleRemove = () => {
    modal.resolve('removed' as RemoveRepoResult);
    modal.hide();
  };

  const handleCancel = () => {
    modal.resolve('canceled' as RemoveRepoResult);
    modal.hide();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) handleCancel();
  };

  return (
    <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('settings:settings.repos.remove.dialogTitle', {
              name: repoName,
            })}
          </DialogTitle>
          <DialogDescription>
            {t('settings:settings.repos.remove.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('common:buttons.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleRemove}>
            {t('settings:settings.repos.remove.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

const RemoveRepoDialog = defineModal<RemoveRepoDialogProps, RemoveRepoResult>(
  RemoveRepoDialogImpl
);

// ── Main section ─────────────────────────────────────────────────────
interface ReposSettingsSectionProps {
  initialState?: { repoId?: string };
}

export function ReposSettingsSection({
  initialState,
}: ReposSettingsSectionProps) {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Fetch all repos
  const {
    data: repos,
    isLoading: reposLoading,
    error: reposError,
  } = useQuery({
    queryKey: ['repos'],
    queryFn: () => repoApi.list(),
  });

  // Selected repo state - initialize from props if provided
  const [selectedRepoId, setSelectedRepoId] = useState<string>(
    initialState?.repoId ?? ''
  );

  // Fetch branches for the selected repo
  const { data: branches = [], isLoading: branchesLoading } = useRepoBranches(
    selectedRepoId || null,
    { enabled: !!selectedRepoId }
  );

  // Add "Use current branch" option at the top of branches list
  const branchItems = useMemo(() => {
    const clearOption = {
      name: '',
      is_current: false,
      is_remote: false,
      last_commit_date: new Date(),
    };
    return [clearOption, ...branches];
  }, [branches]);

  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  // Form state
  const [draft, setDraft] = useState<RepoScriptsFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get OS-appropriate script placeholders
  const placeholders = useScriptPlaceholders();

  // Linked projects: find which remote projects reference this repo
  const { data: allProjects, isLoading: projectsLoading } =
    useAllOrganizationProjects();
  const [linkedProjectNames, setLinkedProjectNames] = useState<string[]>([]);
  const [linkedProjectsLoading, setLinkedProjectsLoading] = useState(false);

  useEffect(() => {
    if (!selectedRepoId || allProjects.length === 0) {
      setLinkedProjectNames([]);
      return;
    }

    let cancelled = false;
    setLinkedProjectsLoading(true);

    (async () => {
      const names: string[] = [];
      for (const project of allProjects) {
        const defaults = await getProjectRepoDefaults(project.id);
        if (cancelled) return;
        if (defaults?.some((r) => r.repo_id === selectedRepoId)) {
          names.push(project.name);
        }
      }
      if (!cancelled) {
        setLinkedProjectNames(names);
        setLinkedProjectsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRepoId, allProjects]);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedRepo) return false;
    return !isEqual(draft, repoToFormState(selectedRepo));
  }, [draft, selectedRepo]);

  // Handle repo selection
  const handleRepoSelect = useCallback(
    (id: string) => {
      if (id === selectedRepoId) return;

      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t('settings.repos.save.confirmSwitch')
        );
        if (!confirmed) return;
        setDraft(null);
        setSelectedRepo(null);
        setSuccess(false);
        setError(null);
      }

      setSelectedRepoId(id);
    },
    [hasUnsavedChanges, selectedRepoId, t]
  );

  const [removing, setRemoving] = useState(false);

  const handleRemoveRepo = useCallback(async () => {
    if (!selectedRepo) return;

    try {
      const result = await RemoveRepoDialog.show({
        repoName: selectedRepo.display_name,
      });
      if (result !== 'removed') return;

      setRemoving(true);
      setError(null);

      await repoApi.delete(selectedRepo.id);
      await queryClient.invalidateQueries({ queryKey: ['repos'] });
      setSelectedRepoId('');
      setSelectedRepo(null);
      setDraft(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setRemoving(false);
    }
  }, [selectedRepo, queryClient]);

  // Handle adding a new repo via folder picker
  const handleAddRepo = useCallback(async () => {
    try {
      const selectedPath = await FolderPickerDialog.show({
        title: t('settings.repos.addRepo.dialogTitle'),
        description: t('settings.repos.addRepo.dialogDescription'),
      });
      if (!selectedPath) return;

      const repo = await repoApi.register({ path: selectedPath });
      await queryClient.invalidateQueries({ queryKey: ['repos'] });
      setSelectedRepoId(repo.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('settings.repos.addRepo.error')
      );
    }
  }, [queryClient, t]);

  // Populate draft from server data
  useEffect(() => {
    if (!repos) return;

    const nextRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;

    setSelectedRepo((prev) =>
      prev?.id === nextRepo?.id ? prev : (nextRepo ?? null)
    );

    if (!nextRepo) {
      if (!hasUnsavedChanges) setDraft(null);
      return;
    }

    if (hasUnsavedChanges) return;

    setDraft(repoToFormState(nextRepo));
  }, [repos, selectedRepoId, hasUnsavedChanges]);

  const handleSave = async () => {
    if (!draft || !selectedRepo) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: UpdateRepo = {
        display_name: draft.display_name.trim() || null,
        default_working_dir: draft.default_working_dir.trim() || null,
        default_target_branch: draft.default_target_branch.trim() || null,
        setup_script: draft.setup_script.trim() || null,
        cleanup_script: draft.cleanup_script.trim() || null,
        archive_script: draft.archive_script.trim() || null,
        copy_files: draft.copy_files.trim() || null,
        parallel_setup_script: draft.parallel_setup_script,
        dev_server_script: draft.dev_server_script.trim() || null,
      };

      const updatedRepo = await repoApi.update(selectedRepo.id, updateData);
      setSelectedRepo(updatedRepo);
      setDraft(repoToFormState(updatedRepo));
      queryClient.setQueryData(['repos'], (old: Repo[] | undefined) =>
        old?.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('settings.repos.save.error')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedRepo) return;
    setDraft(repoToFormState(selectedRepo));
  };

  const updateDraft = (updates: Partial<RepoScriptsFormState>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  };

  if (reposLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.repos.loading')}</span>
      </div>
    );
  }

  if (reposError) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {reposError instanceof Error
            ? reposError.message
            : t('settings.repos.loadError')}
        </div>
      </div>
    );
  }

  const repoOptions =
    repos?.map((r) => ({ value: r.id, label: r.display_name })) ?? [];

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-success/10 border border-success/50 rounded-sm p-4 text-success font-medium">
          {t('settings.repos.save.success')}
        </div>
      )}

      {/* Repo selector */}
      <SettingsCard
        title={t('settings.repos.title')}
        description={t('settings.repos.description')}
      >
        <SettingsField
          label={t('settings.repos.selector.label')}
          description={t('settings.repos.selector.helper')}
        >
          <div className="flex gap-2 items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DropdownMenuTriggerButton
                  label={
                    repoOptions.find((r) => r.value === selectedRepoId)
                      ?.label || t('settings.repos.selector.placeholder')
                  }
                  className="w-full justify-between"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                {repoOptions.length > 0 ? (
                  repoOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => handleRepoSelect(option.value)}
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    {t('settings.repos.selector.noRepos')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <PrimaryButton variant="default" onClick={handleAddRepo}>
              <PlusIcon className="size-icon-sm" weight="bold" />
              {t('common:buttons.add')}
            </PrimaryButton>
          </div>
        </SettingsField>
      </SettingsCard>

      {selectedRepo && draft && (
        <>
          {/* General settings */}
          <SettingsCard
            title={t('settings.repos.general.title')}
            description={t('settings.repos.general.description')}
          >
            <SettingsField
              label={t('settings.repos.general.displayName.label')}
              description={t('settings.repos.general.displayName.helper')}
            >
              <SettingsInput
                value={draft.display_name}
                onChange={(value) => updateDraft({ display_name: value })}
                placeholder={t(
                  'settings.repos.general.displayName.placeholder'
                )}
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.general.path.label')}
              description=""
            >
              <div className="text-sm text-low font-mono bg-secondary px-base py-half rounded-sm">
                {selectedRepo.path}
              </div>
            </SettingsField>

            <SettingsField
              label={t('settings.repos.general.defaultWorkingDir.label')}
              description={t('settings.repos.general.defaultWorkingDir.helper')}
            >
              <SettingsInput
                value={draft.default_working_dir}
                onChange={(value) =>
                  updateDraft({ default_working_dir: value })
                }
                placeholder={t(
                  'settings.repos.general.defaultWorkingDir.placeholder'
                )}
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.general.defaultTargetBranch.label')}
              description={t(
                'settings.repos.general.defaultTargetBranch.helper'
              )}
            >
              <SearchableDropdownContainer
                items={branchItems}
                selectedValue={draft.default_target_branch || null}
                getItemKey={(b) => b.name || '__clear__'}
                getItemLabel={(b) =>
                  b.name ||
                  t('settings.repos.general.defaultTargetBranch.useCurrent')
                }
                filterItem={(b, query) =>
                  b.name === '' ||
                  b.name.toLowerCase().includes(query.toLowerCase())
                }
                getItemBadge={(b) => (b.is_current ? 'Current' : undefined)}
                getItemIcon={null}
                onSelect={(b) => updateDraft({ default_target_branch: b.name })}
                placeholder={t(
                  'settings.repos.general.defaultTargetBranch.search'
                )}
                emptyMessage={t(
                  'settings.repos.general.defaultTargetBranch.noBranches'
                )}
                contentClassName="w-[var(--radix-dropdown-menu-trigger-width)]"
                trigger={
                  <DropdownMenuTriggerButton
                    icon={GitBranchIcon}
                    label={
                      branchesLoading
                        ? t(
                            'settings.repos.general.defaultTargetBranch.loading'
                          )
                        : draft.default_target_branch ||
                          t(
                            'settings.repos.general.defaultTargetBranch.placeholder'
                          )
                    }
                    className="w-full justify-between"
                    disabled={branchesLoading}
                  />
                }
              />
            </SettingsField>

            <div className="border-t border-primary pt-base mt-base">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-normal">
                    {t('settings.repos.remove.title')}
                  </p>
                  <p className="text-sm text-low">
                    {t('settings.repos.remove.description')}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleRemoveRepo}
                  disabled={removing}
                >
                  {removing && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('settings.repos.remove.button')}
                </Button>
              </div>
            </div>
          </SettingsCard>

          {/* Linked projects (read-only) */}
          <SettingsCard
            title={t('settings.repos.linkedProjects.title')}
            description={t('settings.repos.linkedProjects.description')}
          >
            {linkedProjectsLoading || projectsLoading ? (
              <div className="flex items-center gap-2 py-half">
                <SpinnerIcon
                  className="size-icon-xs animate-spin text-low"
                  weight="bold"
                />
                <span className="text-sm text-low">
                  {t('settings.repos.linkedProjects.loading')}
                </span>
              </div>
            ) : linkedProjectNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {linkedProjectNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center rounded-sm bg-secondary px-2 py-0.5 text-sm text-normal"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-low">
                {t('settings.repos.linkedProjects.none')}
              </p>
            )}
          </SettingsCard>

          {/* Scripts settings */}
          <SettingsCard
            title={t('settings.repos.scripts.title')}
            description={t('settings.repos.scripts.description')}
          >
            <SettingsField
              label={t('settings.repos.scripts.devServer.label')}
              description={t('settings.repos.scripts.devServer.helper')}
            >
              <SettingsTextarea
                value={draft.dev_server_script}
                onChange={(value) => updateDraft({ dev_server_script: value })}
                placeholder={placeholders.dev}
                monospace
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.scripts.setup.label')}
              description={t('settings.repos.scripts.setup.helper')}
            >
              <SettingsTextarea
                value={draft.setup_script}
                onChange={(value) => updateDraft({ setup_script: value })}
                placeholder={placeholders.setup}
                monospace
              />
            </SettingsField>

            <SettingsCheckbox
              id="parallel-setup-script"
              label={t('settings.repos.scripts.setup.parallelLabel')}
              description={t('settings.repos.scripts.setup.parallelHelper')}
              checked={draft.parallel_setup_script}
              onChange={(checked) =>
                updateDraft({ parallel_setup_script: checked })
              }
              disabled={!draft.setup_script.trim()}
            />

            <SettingsField
              label={t('settings.repos.scripts.cleanup.label')}
              description={t('settings.repos.scripts.cleanup.helper')}
            >
              <SettingsTextarea
                value={draft.cleanup_script}
                onChange={(value) => updateDraft({ cleanup_script: value })}
                placeholder={placeholders.cleanup}
                monospace
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.scripts.archive.label')}
              description={t('settings.repos.scripts.archive.helper')}
            >
              <SettingsTextarea
                value={draft.archive_script}
                onChange={(value) => updateDraft({ archive_script: value })}
                placeholder={placeholders.archive}
                monospace
              />
            </SettingsField>

            <SettingsField
              label={t('settings.repos.scripts.copyFiles.label')}
              description={t('settings.repos.scripts.copyFiles.helper')}
            >
              <SettingsTextarea
                value={draft.copy_files}
                onChange={(value) => updateDraft({ copy_files: value })}
                placeholder={t('settings.repos.scripts.copyFiles.placeholder')}
                rows={3}
              />
            </SettingsField>
          </SettingsCard>

          <SettingsSaveBar
            show={hasUnsavedChanges}
            saving={saving}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        </>
      )}
    </>
  );
}

// Alias for backwards compatibility
export { ReposSettingsSection as ReposSettingsSectionContent };
