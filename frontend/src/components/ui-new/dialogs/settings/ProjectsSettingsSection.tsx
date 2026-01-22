import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import { SpinnerIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { projectsApi } from '@/lib/api';
import { repoBranchKeys } from '@/hooks/useRepoBranches';
import type { Project, Repo, UpdateProject } from 'shared/types';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '../../primitives/Dropdown';
import { IconButton } from '../../primitives/IconButton';
import {
  SettingsCard,
  SettingsField,
  SettingsInput,
  SettingsSaveBar,
} from './SettingsComponents';

interface ProjectFormState {
  name: string;
}

function projectToFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
  };
}

export function ProjectsSettingsSection() {
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Fetch all projects
  const {
    projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useProjects();

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Form state
  const [draft, setDraft] = useState<ProjectFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Repositories state
  const [repositories, setRepositories] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [addingRepo, setAddingRepo] = useState(false);
  const [deletingRepoId, setDeletingRepoId] = useState<string | null>(null);

  // Check for unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedProject) return false;
    return !isEqual(draft, projectToFormState(selectedProject));
  }, [draft, selectedProject]);

  // Handle project selection
  const handleProjectSelect = useCallback(
    (id: string) => {
      if (id === selectedProjectId) return;

      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t('settings.projects.save.confirmSwitch')
        );
        if (!confirmed) return;

        setDraft(null);
        setSelectedProject(null);
        setSuccess(false);
        setError(null);
      }

      setSelectedProjectId(id);
    },
    [hasUnsavedChanges, selectedProjectId, t]
  );

  // Populate draft from server data
  useEffect(() => {
    if (!projects) return;

    const nextProject = selectedProjectId
      ? projects.find((p) => p.id === selectedProjectId)
      : null;

    setSelectedProject((prev) =>
      prev?.id === nextProject?.id ? prev : (nextProject ?? null)
    );

    if (!nextProject) {
      if (!hasUnsavedChanges) setDraft(null);
      return;
    }

    if (hasUnsavedChanges) return;

    setDraft(projectToFormState(nextProject));
  }, [projects, selectedProjectId, hasUnsavedChanges]);

  // Fetch repositories when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setRepositories([]);
      return;
    }

    setLoadingRepos(true);
    setRepoError(null);
    projectsApi
      .getRepositories(selectedProjectId)
      .then(setRepositories)
      .catch((err) => {
        setRepoError(
          err instanceof Error ? err.message : 'Failed to load repositories'
        );
        setRepositories([]);
      })
      .finally(() => setLoadingRepos(false));
  }, [selectedProjectId]);

  const handleAddRepository = async () => {
    if (!selectedProjectId) return;

    const repo = await RepoPickerDialog.show({
      title: 'Select Git Repository',
      description: 'Choose a git repository to add to this project',
    });

    if (!repo) return;

    if (repositories.some((r) => r.id === repo.id)) {
      return;
    }

    setAddingRepo(true);
    setRepoError(null);
    try {
      const newRepo = await projectsApi.addRepository(selectedProjectId, {
        display_name: repo.display_name,
        git_repo_path: repo.path,
      });
      setRepositories((prev) => [...prev, newRepo]);
      queryClient.invalidateQueries({
        queryKey: ['projectRepositories', selectedProjectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['repos'],
      });
      queryClient.invalidateQueries({
        queryKey: repoBranchKeys.byRepo(newRepo.id),
      });
    } catch (err) {
      setRepoError(
        err instanceof Error ? err.message : 'Failed to add repository'
      );
    } finally {
      setAddingRepo(false);
    }
  };

  const handleDeleteRepository = async (repoId: string) => {
    if (!selectedProjectId) return;

    setDeletingRepoId(repoId);
    setRepoError(null);
    try {
      await projectsApi.deleteRepository(selectedProjectId, repoId);
      setRepositories((prev) => prev.filter((r) => r.id !== repoId));
      queryClient.invalidateQueries({
        queryKey: ['projectRepositories', selectedProjectId],
      });
      queryClient.invalidateQueries({
        queryKey: ['repos'],
      });
      queryClient.invalidateQueries({
        queryKey: repoBranchKeys.byRepo(repoId),
      });
    } catch (err) {
      setRepoError(
        err instanceof Error ? err.message : 'Failed to delete repository'
      );
    } finally {
      setDeletingRepoId(null);
    }
  };

  const { updateProject } = useProjectMutations({
    onUpdateSuccess: (updatedProject: Project) => {
      setSelectedProject(updatedProject);
      setDraft(projectToFormState(updatedProject));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      setSaving(false);
    },
    onUpdateError: (err) => {
      setError(
        err instanceof Error ? err.message : 'Failed to save project settings'
      );
      setSaving(false);
    },
  });

  const handleSave = async () => {
    if (!draft || !selectedProject) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updateData: UpdateProject = {
        name: draft.name.trim(),
      };

      updateProject.mutate({
        projectId: selectedProject.id,
        data: updateData,
      });
    } catch (err) {
      setError(t('settings.projects.save.error'));
      console.error('Error saving project settings:', err);
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!selectedProject) return;
    setDraft(projectToFormState(selectedProject));
  };

  const updateDraft = (updates: Partial<ProjectFormState>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
  };

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2">
        <SpinnerIcon
          className="size-icon-lg animate-spin text-brand"
          weight="bold"
        />
        <span className="text-normal">{t('settings.projects.loading')}</span>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="py-8">
        <div className="bg-error/10 border border-error/50 rounded-sm p-4 text-error">
          {projectsError instanceof Error
            ? projectsError.message
            : t('settings.projects.loadError')}
        </div>
      </div>
    );
  }

  const projectOptions =
    projects?.map((p) => ({ value: p.id, label: p.name })) ?? [];

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
          {t('settings.projects.save.success')}
        </div>
      )}

      {/* Project selector */}
      <SettingsCard
        title={t('settings.projects.title')}
        description={t('settings.projects.description')}
      >
        <SettingsField
          label={t('settings.projects.selector.label')}
          description={t('settings.projects.selector.helper')}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <DropdownMenuTriggerButton
                label={
                  projectOptions.find((p) => p.value === selectedProjectId)
                    ?.label || t('settings.projects.selector.placeholder')
                }
                className="w-full justify-between"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {projectOptions.length > 0 ? (
                projectOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleProjectSelect(option.value)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>
                  {t('settings.projects.selector.noProjects')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SettingsField>
      </SettingsCard>

      {selectedProject && draft && (
        <>
          {/* General settings */}
          <SettingsCard
            title={t('settings.projects.general.title')}
            description={t('settings.projects.general.description')}
          >
            <SettingsField
              label={t('settings.projects.general.name.label')}
              description={t('settings.projects.general.name.helper')}
            >
              <SettingsInput
                value={draft.name}
                onChange={(value) => updateDraft({ name: value })}
                placeholder={t('settings.projects.general.name.placeholder')}
              />
            </SettingsField>
          </SettingsCard>

          {/* Repositories */}
          <SettingsCard
            title={t('settings.projects.repositories.title')}
            description={t('settings.projects.repositories.description')}
          >
            {repoError && (
              <div className="bg-error/10 border border-error/50 rounded-sm p-3 text-error text-sm">
                {repoError}
              </div>
            )}

            {loadingRepos ? (
              <div className="flex items-center justify-center py-4 gap-2">
                <SpinnerIcon className="size-icon-sm animate-spin" />
                <span className="text-sm text-low">
                  Loading repositories...
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {repositories.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between p-3 border border-border/50 rounded-sm hover:bg-secondary/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-normal">
                        {repo.display_name}
                      </div>
                      <div className="text-sm text-low truncate">
                        {repo.path}
                      </div>
                    </div>
                    <IconButton
                      icon={
                        deletingRepoId === repo.id ? SpinnerIcon : TrashIcon
                      }
                      onClick={() => handleDeleteRepository(repo.id)}
                      disabled={deletingRepoId === repo.id}
                      aria-label="Delete repository"
                      title="Delete repository"
                    />
                  </div>
                ))}

                {repositories.length === 0 && !loadingRepos && (
                  <div className="text-center py-4 text-sm text-low">
                    {t('settings.projects.repositories.noRepositories')}
                  </div>
                )}

                <button
                  onClick={handleAddRepository}
                  disabled={addingRepo}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 p-3 rounded-sm border border-dashed border-border/50',
                    'text-sm text-low hover:text-normal hover:border-border hover:bg-secondary/30 transition-colors',
                    addingRepo && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {addingRepo ? (
                    <SpinnerIcon className="size-icon-sm animate-spin" />
                  ) : (
                    <PlusIcon className="size-icon-sm" weight="bold" />
                  )}
                  {t('settings.projects.repositories.addRepository')}
                </button>
              </div>
            )}
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
export { ProjectsSettingsSection as ProjectsSettingsSectionContent };
