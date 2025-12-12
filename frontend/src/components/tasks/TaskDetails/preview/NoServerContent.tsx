import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Play,
  Edit3,
  Square,
  SquareTerminal,
  Save,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExecutionProcess, Project } from 'shared/types';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/scriptPlaceholders';
import { useUserSystem } from '@/components/ConfigProvider';
import { useTaskMutations } from '@/hooks/useTaskMutations';
import { useProjectMutations } from '@/hooks/useProjectMutations';
import { projectsApi } from '@/lib/api';
import {
  COMPANION_INSTALL_TASK_TITLE,
  COMPANION_INSTALL_TASK_DESCRIPTION,
} from '@/utils/companionInstallTask';

interface NoServerContentProps {
  projectHasDevScript: boolean;
  runningDevServer: ExecutionProcess | undefined;
  isStartingDevServer: boolean;
  startDevServer: () => void;
  stopDevServer: () => void;
  project: Project | undefined;
}

export function NoServerContent({
  projectHasDevScript,
  runningDevServer,
  isStartingDevServer,
  startDevServer,
  stopDevServer,
  project,
}: NoServerContentProps) {
  const { t } = useTranslation('tasks');
  const [devScriptInput, setDevScriptInput] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingExistingScript, setIsEditingExistingScript] = useState(false);
  const { system, config } = useUserSystem();

  const { createAndStart } = useTaskMutations(project?.id);
  const { updateProject } = useProjectMutations();

  const { data: projectRepos = [] } = useQuery({
    queryKey: ['projectRepositories', project?.id],
    queryFn: () =>
      project?.id
        ? projectsApi.getRepositories(project.id)
        : Promise.resolve([]),
    enabled: !!project?.id,
  });

  // Create strategy-based placeholders
  const placeholders = system.environment
    ? new ScriptPlaceholderContext(
        createScriptPlaceholderStrategy(system.environment.os_type)
      ).getPlaceholders()
    : {
        setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
        dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
        cleanup:
          '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
      };

  const handleSaveDevScript = async (startAfterSave?: boolean) => {
    setSaveError(null);
    if (!project) {
      setSaveError(t('preview.devScript.errors.notLoaded'));
      return;
    }

    const script = devScriptInput.trim();
    if (!script) {
      setSaveError(t('preview.devScript.errors.empty'));
      return;
    }

    updateProject.mutate(
      { projectId: project.id, data: { name: null, dev_script: script } },
      {
        onSuccess: () => {
          setIsEditingExistingScript(false);
          if (startAfterSave) {
            startDevServer();
          }
        },
        onError: (err) => {
          setSaveError((err as Error)?.message || 'Failed to save dev script');
        },
      }
    );
  };

  const handleEditExistingScript = () => {
    if (project?.dev_script) {
      setDevScriptInput(project.dev_script);
    }
    setIsEditingExistingScript(true);
    setSaveError(null);
  };

  const handleCancelEdit = () => {
    setIsEditingExistingScript(false);
    setDevScriptInput('');
    setSaveError(null);
  };

  const handleInstallCompanion = () => {
    if (!project || !config || projectRepos.length === 0) return;

    const repos = projectRepos.map((repo) => ({
      repo_id: repo.id,
      target_branch: 'main',
    }));

    createAndStart.mutate({
      task: {
        project_id: project.id,
        title: COMPANION_INSTALL_TASK_TITLE,
        description: COMPANION_INSTALL_TASK_DESCRIPTION,
        status: null,
        parent_task_attempt: null,
        image_ids: null,
        shared_task_id: null,
      },
      executor_profile_id: config.executor_profile,
      repos,
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto p-6">
        <div className="flex items-center justify-center">
          <SquareTerminal className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {t('preview.noServer.title')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {projectHasDevScript
                ? t('preview.noServer.startPrompt')
                : t('preview.noServer.setupPrompt')}
            </p>
          </div>

          {!isEditingExistingScript ? (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant={runningDevServer ? 'destructive' : 'default'}
                size="sm"
                onClick={() => {
                  if (runningDevServer) {
                    stopDevServer();
                  } else {
                    startDevServer();
                  }
                }}
                disabled={isStartingDevServer || !projectHasDevScript}
                className="gap-1"
              >
                {runningDevServer ? (
                  <>
                    <Square className="h-4 w-4" />
                    {t('preview.toolbar.stopDevServer')}
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    {t('preview.noServer.startButton')}
                  </>
                )}
              </Button>

              {!runningDevServer && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEditExistingScript}
                  className="gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  {t('preview.noServer.editButton')}
                </Button>
              )}
            </div>
          ) : (
            <div className="text-left">
              <div className="space-y-4">
                <Textarea
                  id="devScript"
                  placeholder={placeholders.dev}
                  value={devScriptInput}
                  onChange={(e) => setDevScriptInput(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                  disabled={updateProject.isPending}
                />

                {saveError && (
                  <Alert variant="destructive">
                    <AlertDescription>{saveError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2 justify-center">
                  {isEditingExistingScript ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleSaveDevScript(false)}
                        disabled={updateProject.isPending}
                        className="gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {t('preview.devScript.saveChanges')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={updateProject.isPending}
                        className="gap-1"
                      >
                        <X className="h-3 w-3" />
                        {t('preview.devScript.cancel')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleSaveDevScript(true)}
                        disabled={updateProject.isPending}
                        className="gap-1"
                      >
                        <Play className="h-4 w-4" />
                        {t('preview.devScript.saveAndStart')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveDevScript(false)}
                        disabled={updateProject.isPending}
                        className="gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {t('preview.devScript.saveOnly')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              {t('preview.noServer.companionPrompt')}
            </p>
            <div className="space-y-2">
              <Button
                size="sm"
                onClick={handleInstallCompanion}
                disabled={!project || !config || createAndStart.isPending}
                className="gap-1"
                variant="outline"
              >
                {createAndStart.isPending
                  ? 'Creating task…'
                  : 'Install companion automatically'}
              </Button>
              <div>
                <a
                  href="https://github.com/BloopAI/vibe-kanban-web-companion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('preview.noServer.companionLink')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
