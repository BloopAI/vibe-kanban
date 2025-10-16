import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, AlertCircle, CheckCircle } from 'lucide-react';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import type { Project, CreateTask, UpdateProject } from 'shared/types';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/script-placeholders';
import { useUserSystem } from '@/components/config-provider';
import { DEFAULT_TASKS } from '@/utils/default-tasks';
import { ProjectScriptsForm } from './ProjectScriptsForm';

interface ProjectSetupWizardProps {
  project: Project;
}

/**
 * ProjectSetupWizard guides users through configuring their project's development
 * scripts and optionally creating starter tasks from predefined templates.
 *
 * Features:
 * - Configure setup, dev server, and cleanup scripts
 * - Specify files to copy to worktrees
 * - Select from default task templates (e.g., Vibe Kanban Companion installation)
 * - Automatically saves configuration and creates selected tasks
 */
export function ProjectSetupWizard({ project }: ProjectSetupWizardProps) {
  const { t } = useTranslation('projects');
  const [setupScript, setSetupScript] = useState(project.setup_script ?? '');
  const [devScript, setDevScript] = useState(project.dev_script ?? '');
  const [cleanupScript, setCleanupScript] = useState(
    project.cleanup_script ?? ''
  );
  const [copyFiles, setCopyFiles] = useState(project.copy_files ?? '');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [createdTaskIds, setCreatedTaskIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const { system } = useUserSystem();

  const placeholders = useMemo(() => {
    return system.environment
      ? new ScriptPlaceholderContext(
          createScriptPlaceholderStrategy(system.environment.os_type)
        ).getPlaceholders()
      : {
          setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
          dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
          cleanup:
            '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
        };
  }, [system.environment?.os_type]);

  const { updateProject } = useProjectMutations();
  const { createTask } = useTaskMutations(project.id);

  const toggleTask = (taskId: string) => {
    if (createdTaskIds.has(taskId)) return;
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const hasChanges = () => {
    return (
      setupScript.trim() !== (project.setup_script ?? '').trim() ||
      devScript.trim() !== (project.dev_script ?? '').trim() ||
      cleanupScript.trim() !== (project.cleanup_script ?? '').trim() ||
      copyFiles.trim() !== (project.copy_files ?? '').trim() ||
      selectedTaskIds.size > 0
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const updateData: Partial<UpdateProject> = {};

      if (setupScript.trim() !== (project.setup_script ?? '').trim()) {
        updateData.setup_script = setupScript.trim() || null;
      }
      if (devScript.trim() !== (project.dev_script ?? '').trim()) {
        updateData.dev_script = devScript.trim() || null;
      }
      if (cleanupScript.trim() !== (project.cleanup_script ?? '').trim()) {
        updateData.cleanup_script = cleanupScript.trim() || null;
      }
      if (copyFiles.trim() !== (project.copy_files ?? '').trim()) {
        updateData.copy_files = copyFiles.trim() || null;
      }

      if (Object.keys(updateData).length > 0) {
        await updateProject.mutateAsync({
          projectId: project.id,
          data: updateData as UpdateProject,
        });
      }

      const tasksToCreate = DEFAULT_TASKS.filter((task) =>
        selectedTaskIds.has(task.id)
      );

      if (tasksToCreate.length > 0) {
        const results = await Promise.allSettled(
          tasksToCreate.map((defaultTask) => {
            const taskData: CreateTask = {
              project_id: project.id,
              title: defaultTask.title,
              description: defaultTask.description,
              parent_task_attempt: null,
              image_ids: null,
            };
            return createTask.mutateAsync(taskData);
          })
        );

        const succeeded = results.filter(
          (r) => r.status === 'fulfilled'
        ).length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        setCreatedTaskIds(
          (prev) => new Set([...prev, ...Array.from(selectedTaskIds)])
        );
        setSelectedTaskIds(new Set());

        if (failed > 0) {
          setError(
            `Created ${succeeded} task${succeeded !== 1 ? 's' : ''}, but ${failed} failed`
          );
        } else {
          setSuccessMessage(
            `Successfully saved settings and created ${succeeded} task${succeeded !== 1 ? 's' : ''}!`
          );
        }
      } else {
        setSuccessMessage('Settings saved successfully!');
      }
    } catch (err) {
      console.error('Failed to save setup:', err);
      setError(err instanceof Error ? err.message : 'Failed to save setup');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">{t('setup.title')}</h2>
        <p className="text-base text-muted-foreground">
          {t('setup.description')}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {successMessage}
          </AlertDescription>
        </Alert>
      )}

      <ProjectScriptsForm
        setupScript={setupScript}
        setSetupScript={setSetupScript}
        devScript={devScript}
        setDevScript={setDevScript}
        cleanupScript={cleanupScript}
        setCleanupScript={setCleanupScript}
        copyFiles={copyFiles}
        setCopyFiles={setCopyFiles}
        placeholders={placeholders}
        projectId={project.id}
      />

      <div className="border-t pt-6 space-y-3">
        <h3 className="text-base font-medium">{t('setup.starterTasks')}</h3>
        <div className="space-y-2">
          {DEFAULT_TASKS.map((task) => {
            const isCreated = createdTaskIds.has(task.id);
            const isSelected = selectedTaskIds.has(task.id);
            return (
              <div
                key={task.id}
                className={`p-3 border rounded-md transition-all ${
                  isCreated
                    ? 'border-green-500 bg-green-50 dark:bg-green-950/20 opacity-75'
                    : isSelected
                      ? 'border-primary bg-primary/5 cursor-pointer'
                      : 'border-border hover:border-primary/50 cursor-pointer'
                }`}
                onClick={() => toggleTask(task.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center ${
                      isCreated
                        ? 'bg-green-500 border-green-500'
                        : isSelected
                          ? 'bg-primary border-primary'
                          : 'border-muted-foreground'
                    }`}
                  >
                    {(isSelected || isCreated) && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">
                      {task.title}
                      {isCreated && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                          (Created)
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t(task.descriptionKey)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges()}
        className="w-full"
      >
        {saving ? t('setup.saving') : t('setup.saveButton')}
      </Button>
    </div>
  );
}
