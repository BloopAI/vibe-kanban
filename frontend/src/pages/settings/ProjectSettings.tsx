import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Folder } from 'lucide-react';
import { useProjects } from '@/hooks/useProjects';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useScriptPlaceholders } from '@/hooks/useScriptPlaceholders';
import { CopyFilesField } from '@/components/projects/copy-files-field';
import { AutoExpandingTextarea } from '@/components/ui/auto-expanding-textarea';
import { showFolderPicker } from '@/lib/modals';
import type { Project, UpdateProject } from 'shared/types';

interface ProjectFormState {
  name: string;
  git_repo_path: string;
  setup_script: string;
  dev_script: string;
  cleanup_script: string;
  copy_files: string;
}

function projectToFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
    git_repo_path: project.git_repo_path,
    setup_script: project.setup_script ?? '',
    dev_script: project.dev_script ?? '',
    cleanup_script: project.cleanup_script ?? '',
    copy_files: project.copy_files ?? '',
  };
}

export function ProjectSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdParam = searchParams.get('projectId') ?? '';
  const { t } = useTranslation('settings');

  // Fetch all projects
  const {
    data: projects,
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

  // Get OS-appropriate script placeholders
  const placeholders = useScriptPlaceholders();

  // Check for unsaved changes
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
        git_repo_path: draft.git_repo_path.trim(),
        setup_script: draft.setup_script.trim() || null,
        dev_script: draft.dev_script.trim() || null,
        cleanup_script: draft.cleanup_script.trim() || null,
        copy_files: draft.copy_files.trim() || null,
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
            <Label htmlFor="project-selector">
              {t('settings.projects.selector.label')}
            </Label>
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
                <Label htmlFor="project-name">
                  {t('settings.projects.general.name.label')}
                </Label>
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

              <div className="space-y-2">
                <Label htmlFor="git-repo-path">
                  {t('settings.projects.general.repoPath.label')}
                </Label>
                <div className="flex space-x-2">
                  <Input
                    id="git-repo-path"
                    type="text"
                    value={draft.git_repo_path}
                    onChange={(e) =>
                      updateDraft({ git_repo_path: e.target.value })
                    }
                    placeholder={t(
                      'settings.projects.general.repoPath.placeholder'
                    )}
                    required
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      const selectedPath = await showFolderPicker({
                        title: 'Select Git Repository',
                        description: 'Choose an existing git repository',
                        value: draft.git_repo_path,
                      });
                      if (selectedPath) {
                        updateDraft({ git_repo_path: selectedPath });
                      }
                    }}
                  >
                    <Folder className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.general.repoPath.helper')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.projects.scripts.title')}</CardTitle>
              <CardDescription>
                {t('settings.projects.scripts.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="setup-script">
                  {t('settings.projects.scripts.setup.label')}
                </Label>
                <AutoExpandingTextarea
                  id="setup-script"
                  value={draft.setup_script}
                  onChange={(e) =>
                    updateDraft({ setup_script: e.target.value })
                  }
                  placeholder={placeholders.setup}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.scripts.setup.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dev-script">
                  {t('settings.projects.scripts.dev.label')}
                </Label>
                <AutoExpandingTextarea
                  id="dev-script"
                  value={draft.dev_script}
                  onChange={(e) => updateDraft({ dev_script: e.target.value })}
                  placeholder={placeholders.dev}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.scripts.dev.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cleanup-script">
                  {t('settings.projects.scripts.cleanup.label')}
                </Label>
                <AutoExpandingTextarea
                  id="cleanup-script"
                  value={draft.cleanup_script}
                  onChange={(e) =>
                    updateDraft({ cleanup_script: e.target.value })
                  }
                  placeholder={placeholders.cleanup}
                  maxRows={12}
                  className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.scripts.cleanup.helper')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.projects.scripts.copyFiles.label')}</Label>
                <CopyFilesField
                  value={draft.copy_files}
                  onChange={(value) => updateDraft({ copy_files: value })}
                  projectId={selectedProject.id}
                />
                <p className="text-sm text-muted-foreground">
                  {t('settings.projects.scripts.copyFiles.helper')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sticky Save Button */}
          <div className="sticky bottom-0 z-10 bg-background/80 backdrop-blur-sm border-t py-4">
            <div className="flex items-center justify-between">
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
                  disabled={!hasUnsavedChanges || saving}
                >
                  {t('settings.projects.save.discard')}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('settings.projects.save.button')}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
