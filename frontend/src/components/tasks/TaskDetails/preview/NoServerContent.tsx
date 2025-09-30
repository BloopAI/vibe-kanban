import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Edit3, SquareTerminal, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ExecutionProcess, Project } from 'shared/types';
import { ScriptPlaceholders } from '@/utils/script-placeholders';
import { projectsApi } from '@/lib/api';

interface NoServerContentProps {
  projectHasDevScript: boolean;
  placeholders: ScriptPlaceholders;
  runningDevServer: ExecutionProcess | undefined;
  isStartingDevServer: boolean;
  startDevServer: () => void;
  stopDevServer: () => void;
  project: Project | undefined;
}

export function NoServerContent({
  projectHasDevScript,
  placeholders,
  runningDevServer,
  isStartingDevServer,
  startDevServer,
  stopDevServer,
  project,
}: NoServerContentProps) {
  const { t } = useTranslation('tasks');
  const [devScriptInput, setDevScriptInput] = useState('');
  const [isSavingDevScript, setIsSavingDevScript] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingExistingScript, setIsEditingExistingScript] = useState(false);

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

    setIsSavingDevScript(true);
    try {
      await projectsApi.update(project.id, {
        name: project.name,
        git_repo_path: project.git_repo_path,
        setup_script: project.setup_script ?? null,
        dev_script: script,
        cleanup_script: project.cleanup_script ?? null,
        copy_files: project.copy_files ?? null,
      });

      setIsEditingExistingScript(false);

      if (startAfterSave) {
        startDevServer();
      }
    } catch (err: unknown) {
      setSaveError((err as Error)?.message || 'Failed to save dev script');
    } finally {
      setIsSavingDevScript(false);
    }
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

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md mx-auto p-6">
        <div className="flex items-center justify-center">
          <SquareTerminal className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-foreground mb-2">
            {t('preview.noServer.title')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {projectHasDevScript
              ? t('preview.noServer.startPrompt')
              : t('preview.noServer.setupPrompt')}
          </p>
          {projectHasDevScript && !isEditingExistingScript && (
            <div className="mt-4 flex items-center justify-center gap-2">
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
                disabled={isStartingDevServer}
                className="gap-1"
              >
                <Play className="h-4 w-4" />
                {t('preview.noServer.startButton')}
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
          )}

          {(!projectHasDevScript || isEditingExistingScript) && (
            <div className="mt-6 text-left">
              <div className="space-y-3">
                <label
                  htmlFor="devScript"
                  className="block text-sm font-medium text-foreground text-center"
                >
                  {t('preview.devScript.label')}
                </label>
                <Textarea
                  id="devScript"
                  placeholder={placeholders.dev}
                  value={devScriptInput}
                  onChange={(e) => setDevScriptInput(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                  disabled={isSavingDevScript}
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
                        disabled={isSavingDevScript}
                        className="gap-1"
                      >
                        <Save className="h-3 w-3" />
                        {t('preview.devScript.saveChanges')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        disabled={isSavingDevScript}
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
                        disabled={isSavingDevScript}
                        className="gap-1"
                      >
                        <Play className="h-4 w-4" />
                        {t('preview.devScript.saveAndStart')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveDevScript(false)}
                        disabled={isSavingDevScript}
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
        </div>
      </div>
    </div>
  );
}
