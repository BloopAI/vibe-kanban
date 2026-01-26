import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual } from 'lodash';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label as FormLabel } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Trash2, Settings2 } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { RepoPickerDialog } from '@/components/dialogs/shared/RepoPickerDialog';
import { projectsApi } from '@/lib/api';
import { repoBranchKeys } from '@/hooks/useRepoBranches';
import type { Project, Repo, UpdateProject, Label as TaskLabel } from 'shared/types';
import { useAutoReviewSettings } from '@/hooks/useAutoReviewSettings';
import { AutoReviewSettingsDialog } from '@/components/dialogs/tasks/AutoReviewSettingsDialog';
import { useProjectLabels, useCreateLabel, useDeleteLabel, useUpdateLabel } from '@/hooks/useLabels';
import { useUserSystem } from '@/components/ConfigProvider';

interface ProjectFormState {
  name: string;
}

function projectToFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
  };
}

export function ProjectSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectIdParam = searchParams.get('projectId') ?? '';
  const { t } = useTranslation('settings');
  const queryClient = useQueryClient();

  // Fetch all projects
  const {
    projects,
    isLoading: projectsLoading,
    error: projectsError,
  } = useProjects();

  // Selected project state
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    searchParams.get('projectId') || ''
  );
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


  // Auto-review settings
  const { settings: autoReviewSettings, updateSettings } = useAutoReviewSettings(
    selectedProjectId || undefined
  );

  // Labels state
  const { data: labels = [], isLoading: labelsLoading } = useProjectLabels(selectedProjectId || undefined);
  const createLabel = useCreateLabel(selectedProjectId || undefined);
  const deleteLabel = useDeleteLabel(selectedProjectId || undefined);
  const updateLabel = useUpdateLabel(selectedProjectId || undefined);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#3b82f6');
  const [newLabelExecutor, setNewLabelExecutor] = useState<string | null>(null);
  const [isAddingLabel, setIsAddingLabel] = useState(false);

  // Get available executors
  const { profiles } = useUserSystem();
  const executorOptions = useMemo(() => {
    if (!profiles) return [];
    return Object.keys(profiles);
  }, [profiles]);

  const handleOpenAutoReviewSettings = () => {
    if (!selectedProjectId) return;
    AutoReviewSettingsDialog.show({
      projectId: selectedProjectId,
      currentSettings: autoReviewSettings,
      onSave: updateSettings,
    });
  };

  // Check for unsaved changes (project name)
  const hasUnsavedChanges = useMemo(() => {
    if (!draft || !selectedProject) return false;
    return !isEqual(draft, projectToFormState(selectedProject));
  }, [draft, selectedProject]);

  // Handle project selection from dropdown
  const handleProjectSelect = useCallback(
    (id: string) => {
      // No-op if same project
      if (id === selectedProjectId) return;

      // Confirm if there are unsaved changes
      if (hasUnsavedChanges) {
        const confirmed = window.confirm(
          t('settings.projects.save.confirmSwitch')
        );
        if (!confirmed) return;

        // Clear local state before switching
        setDraft(null);
        setSelectedProject(null);
        setSuccess(false);
        setError(null);
      }

      // Update state and URL
      setSelectedProjectId(id);
      if (id) {
        setSearchParams({ projectId: id });
      } else {
        setSearchParams({});
      }
    },
    [hasUnsavedChanges, selectedProjectId, setSearchParams, t]
  );

  // Sync selectedProjectId when URL changes (with unsaved changes prompt)
  useEffect(() => {
    if (projectIdParam === selectedProjectId) return;

    // Confirm if there are unsaved changes
    if (hasUnsavedChanges) {
      const confirmed = window.confirm(
        t('settings.projects.save.confirmSwitch')
      );
      if (!confirmed) {
        // Revert URL to previous value
        if (selectedProjectId) {
          setSearchParams({ projectId: selectedProjectId });
        } else {
          setSearchParams({});
        }
        return;
      }

      // Clear local state before switching
      setDraft(null);
      setSelectedProject(null);
      setSuccess(false);
      setError(null);
    }

    setSelectedProjectId(projectIdParam);
  }, [
    projectIdParam,
    hasUnsavedChanges,
    selectedProjectId,
    setSearchParams,
    t,
  ]);

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

  // Warn on tab close/navigation with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

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
      // Update local state with fresh data from server
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
        pm_task_id: null, // Deprecated - PM is now native to project
        pm_docs: null, // Keep existing pm_docs unchanged
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

  // Label handlers
  const handleAddLabel = async () => {
    if (!newLabelName.trim()) return;
    setIsAddingLabel(true);
    try {
      await createLabel.mutateAsync({
        name: newLabelName.trim(),
        color: newLabelColor,
        executor: newLabelExecutor,
      });
      setNewLabelName('');
      setNewLabelColor('#3b82f6');
      setNewLabelExecutor(null);
    } finally {
      setIsAddingLabel(false);
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    if (window.confirm(t('settings.projects.labels.deleteConfirm', 'Are you sure you want to delete this label?'))) {
      await deleteLabel.mutateAsync(labelId);
    }
  };

  const handleUpdateLabelExecutor = async (labelId: string, executor: string | null) => {
    const label = labels.find((l: TaskLabel) => l.id === labelId);
    if (!label) return;
    await updateLabel.mutateAsync({
      labelId,
      data: {
        name: label.name,
        color: label.color,
        executor,
      },
    });
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
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">{t('settings.projects.loading')}</span>
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="py-8">
        <Alert variant="destructive">
          <AlertDescription>
            {projectsError instanceof Error
              ? projectsError.message
              : t('settings.projects.loadError')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          <AlertDescription className="font-medium">
            {t('settings.projects.save.success')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.projects.title')}</CardTitle>
          <CardDescription>
            {t('settings.projects.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="project-selector">
              {t('settings.projects.selector.label')}
            </FormLabel>
            <Select
              value={selectedProjectId}
              onValueChange={handleProjectSelect}
            >
              <SelectTrigger id="project-selector">
                <SelectValue
                  placeholder={t('settings.projects.selector.placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {projects && projects.length > 0 ? (
                  projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-projects" disabled>
                    {t('settings.projects.selector.noProjects')}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t('settings.projects.selector.helper')}
            </p>
          </div>
        </CardContent>
      </Card>

      {selectedProject && draft && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.projects.general.title')}</CardTitle>
              <CardDescription>
                {t('settings.projects.general.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <FormLabel htmlFor="project-name">
                  {t('settings.projects.general.name.label')}
                </FormLabel>
                <Input
                  id="project-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft({ name: e.target.value })}
                  placeholder={t('settings.projects.general.name.placeholder')}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.general.name.helper')}
                </p>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-4 border-t">
                {hasUnsavedChanges ? (
                  <span className="text-sm text-muted-foreground">
                    {t('settings.projects.save.unsavedChanges')}
                  </span>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDiscard}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    {t('settings.projects.save.discard')}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('settings.projects.save.saving')}
                      </>
                    ) : (
                      t('settings.projects.save.button')
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Labels Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.projects.labels.title', 'Labels')}</CardTitle>
              <CardDescription>
                {t('settings.projects.labels.description', 'Create and manage labels to categorize tasks.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {labelsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    {t('settings.projects.labels.loading', 'Loading labels...')}
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {labels.map((label: TaskLabel) => (
                    <div
                      key={label.id}
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: label.color }}
                        />
                        <span className="font-medium">{label.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={label.executor || '_none'}
                          onValueChange={(value) =>
                            handleUpdateLabelExecutor(label.id, value === '_none' ? null : value)
                          }
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder={t('settings.projects.labels.selectExecutor', 'Default Agent')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">
                              <span className="text-muted-foreground">{t('settings.projects.labels.noDefaultAgent', 'None')}</span>
                            </SelectItem>
                            {executorOptions.map((executor) => (
                              <SelectItem key={executor} value={executor}>
                                {executor.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteLabel(label.id)}
                          title="Delete label"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {labels.length === 0 && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      {t('settings.projects.labels.noLabels', 'No labels configured')}
                    </div>
                  )}

                  {/* Add new label */}
                  <div className="flex flex-wrap items-center gap-2 p-3 border border-dashed rounded-md">
                    <input
                      type="color"
                      value={newLabelColor}
                      onChange={(e) => setNewLabelColor(e.target.value)}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                      placeholder={t('settings.projects.labels.namePlaceholder', 'Label name')}
                      className="flex-1 min-w-[120px]"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddLabel()}
                    />
                    <Select
                      value={newLabelExecutor || '_none'}
                      onValueChange={(value) => setNewLabelExecutor(value === '_none' ? null : value)}
                    >
                      <SelectTrigger className="w-[140px] h-9">
                        <SelectValue placeholder={t('settings.projects.labels.selectExecutor', 'Default Agent')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">
                          <span className="text-muted-foreground">{t('settings.projects.labels.noDefaultAgent', 'None')}</span>
                        </SelectItem>
                        {executorOptions.map((executor) => (
                          <SelectItem key={executor} value={executor}>
                            {executor.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddLabel}
                      disabled={!newLabelName.trim() || isAddingLabel}
                      size="sm"
                    >
                      {isAddingLabel ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      <span className="ml-1">{t('settings.projects.labels.add', 'Add')}</span>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Repositories Section */}
          <Card>
            <CardHeader>
              <CardTitle>Repositories</CardTitle>
              <CardDescription>
                Manage the git repositories in this project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {repoError && (
                <Alert variant="destructive">
                  <AlertDescription>{repoError}</AlertDescription>
                </Alert>
              )}

              {loadingRepos ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Loading repositories...
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {repositories.map((repo) => (
                    <div
                      key={repo.id}
                      className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() =>
                        navigate(`/settings/repos?repoId=${repo.id}`)
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{repo.display_name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {repo.path}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteRepository(repo.id);
                        }}
                        disabled={deletingRepoId === repo.id}
                        title="Delete repository"
                      >
                        {deletingRepoId === repo.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}

                  {repositories.length === 0 && !loadingRepos && (
                    <div className="text-center py-4 text-sm text-muted-foreground">
                      No repositories configured
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddRepository}
                    disabled={addingRepo}
                    className="w-full"
                  >
                    {addingRepo ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Add Repository
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Auto-Review Settings Section */}
          <Card>
            <CardHeader>
              <CardTitle>Auto-Review</CardTitle>
              <CardDescription>
                Configure automated code reviews for this project
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-md">
                <div className="space-y-1">
                  <div className="font-medium">
                    Auto-Review Configuration
                    {autoReviewSettings.enabled && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        Enabled
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {autoReviewSettings.enabled
                      ? 'Automated reviews are enabled for this project.'
                      : 'Automated reviews are currently disabled.'}
                  </div>
                </div>
                <Button variant="outline" onClick={handleOpenAutoReviewSettings}>
                  <Settings2 className="h-4 w-4 mr-2" />
                  Configure
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sticky Save Button for Project Name */}
          {hasUnsavedChanges && (
            <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {t('settings.projects.save.unsavedChanges')}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleDiscard}
                    disabled={saving}
                  >
                    {t('settings.projects.save.discard')}
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('settings.projects.save.button')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
