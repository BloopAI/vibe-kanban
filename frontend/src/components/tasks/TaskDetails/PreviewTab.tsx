import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ExternalLink,
  RefreshCw,
  Copy,
  Loader2,
  Play,
  Terminal,
  ChevronDown,
  Edit3,
  SquareTerminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDevserverPreview } from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { TaskAttempt, ExecutionProcess, Project } from 'shared/types';
import { Alert } from '@/components/ui/alert';
import ProcessLogsViewer from './ProcessLogsViewer';
import { useUserSystem } from '@/components/config-provider';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
  ScriptPlaceholders,
} from '@/utils/script-placeholders';
import { projectsApi } from '@/lib/api';
import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useProject } from '@/contexts/project-context';

interface DevServerLogsViewProps {
  latestDevServerProcess: ExecutionProcess | undefined;
  showLogs: boolean;
  onToggle: () => void;
  height?: string;
  showToggleText?: boolean;
}

function DevServerLogsView({
  latestDevServerProcess,
  showLogs,
  onToggle,
  height = 'h-60',
  showToggleText = true,
}: DevServerLogsViewProps) {
  if (!latestDevServerProcess) {
    return null;
  }

  return (
    <div className="border-t bg-background">
      {/* Logs toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            Dev Server Logs
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          <ChevronDown
            className={`h-4 w-4 mr-1 ${showToggleText ? 'transition-transform' : ''} ${showLogs ? '' : 'rotate-180'}`}
          />
          {showToggleText ? (showLogs ? 'Hide' : 'Show') : 'Hide'}
        </Button>
      </div>

      {/* Logs viewer */}
      {showLogs && (
        <div className={height}>
          <ProcessLogsViewer processId={latestDevServerProcess.id} />
        </div>
      )}
    </div>
  );
}

interface PreviewToolbarProps {
  mode: 'noServer' | 'error' | 'ready';
  url?: string;
  onRefresh: () => void;
  onCopyUrl: () => void;
}

function PreviewToolbar({
  mode,
  url,
  onRefresh,
  onCopyUrl,
}: PreviewToolbarProps) {
  return (
    <div className="flex items-center gap-2 p-3 border-b bg-muted/50 shrink-0">
      <span className="text-sm text-muted-foreground font-mono truncate flex-1">
        {url || <Loader2 className="animate-spin" />}
      </span>

      {mode !== 'noServer' && (
        <>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCopyUrl}
            disabled={!url}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" asChild disabled={!url}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </>
      )}
    </div>
  );
}

interface NoServerContentProps {
  effectiveHasDevScript: boolean;
  placeholders: ScriptPlaceholders;
  runningDevServer: ExecutionProcess | undefined;
  isStartingDevServer: boolean;
  startDevServer: () => void;
  stopDevServer: () => void;
  project: Project | undefined;
  projectId: string;
  queryClient: QueryClient;
  setDevScriptAdded: (value: boolean) => void;
}

function NoServerContent({
  effectiveHasDevScript,
  placeholders,
  runningDevServer,
  isStartingDevServer,
  startDevServer,
  stopDevServer,
  project,
  projectId,
  queryClient,
  setDevScriptAdded,
}: NoServerContentProps) {
  const [devScriptInput, setDevScriptInput] = useState('');
  const [isSavingDevScript, setIsSavingDevScript] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditingExistingScript, setIsEditingExistingScript] = useState(false);

  const handleSaveDevScript = async (startAfterSave?: boolean) => {
    setSaveError(null);
    if (!project) {
      setSaveError('Project not loaded');
      return;
    }

    const script = devScriptInput.trim();
    if (!script) {
      setSaveError('Dev script cannot be empty');
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

      setDevScriptAdded(true);
      setIsEditingExistingScript(false);
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] });

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
            No dev server running
          </h3>
          <p className="text-sm text-muted-foreground">
            {effectiveHasDevScript
              ? 'Please start a dev server to see the preview'
              : 'To use the live preview and click-to-edit, please add a dev server script to this project.'}
          </p>
          {effectiveHasDevScript && !isEditingExistingScript && (
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
                Start Dev Server
              </Button>

              {!runningDevServer && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleEditExistingScript}
                  className="gap-1"
                >
                  <Edit3 className="h-3 w-3" />
                  Edit Dev Script
                </Button>
              )}
            </div>
          )}
          {((effectiveHasDevScript && isEditingExistingScript) ||
            !effectiveHasDevScript) && (
            <div className="mt-4 text-left space-y-2 max-w-md">
              <textarea
                value={devScriptInput}
                onChange={(e) => setDevScriptInput(e.target.value)}
                placeholder={placeholders.dev}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded-md resize-vertical focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {saveError && (
                <p className="text-xs text-destructive">{saveError}</p>
              )}
              <div className="flex items-center gap-2 justify-end">
                {effectiveHasDevScript && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isSavingDevScript}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => handleSaveDevScript(false)}
                  disabled={isSavingDevScript || !devScriptInput.trim()}
                  className="gap-1"
                >
                  {isSavingDevScript ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ReadyContentProps {
  url?: string;
  iframeKey: string;
  onIframeError: () => void;
}

function ReadyContent({ url, iframeKey, onIframeError }: ReadyContentProps) {
  return (
    <div className="flex-1">
      <iframe
        key={iframeKey}
        src={url}
        title="Dev server preview"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        referrerPolicy="no-referrer"
        onError={onIframeError}
      />
    </div>
  );
}

interface PreviewTabProps {
  selectedAttempt: TaskAttempt;
  projectId: string;
  projectHasDevScript: boolean;
}

export default function PreviewTab({
  selectedAttempt,
  projectId,
  projectHasDevScript,
}: PreviewTabProps) {
  const [iframeError, setIframeError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimeFinished, setLoadingTimeFinished] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [devScriptAdded, setDevScriptAdded] = useState(false);
  const listenerRef = useRef<ClickToComponentListener | null>(null);

  // Hooks
  const queryClient = useQueryClient();
  const { project } = useProject();
  const { system } = useUserSystem();

  // Compute effective dev script status
  const effectiveHasDevScript = projectHasDevScript || devScriptAdded;

  // Script placeholders
  const placeholders = useMemo(() => {
    if (system.environment) {
      return new ScriptPlaceholderContext(
        createScriptPlaceholderStrategy(system.environment.os_type)
      ).getPlaceholders();
    }
    return {
      setup: '#!/bin/bash\nnpm install\n# Add any setup commands here...',
      dev: '#!/bin/bash\nnpm run dev\n# Add dev server start command here...',
      cleanup:
        '#!/bin/bash\n# Add cleanup commands here...\n# This runs after coding agent execution',
    };
  }, [system.environment]);

  const previewState = useDevserverPreview(selectedAttempt.id, {
    projectHasDevScript: effectiveHasDevScript,
    projectId,
  });

  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(selectedAttempt.id);

  const handleRefresh = () => {
    setIframeError(false);
    setRefreshKey((prev) => prev + 1);
  };
  const handleIframeError = () => {
    setIframeError(true);
  };

  const { addElement } = useClickedElements();

  const handleCopyUrl = async () => {
    if (previewState.url) {
      await navigator.clipboard.writeText(previewState.url);
    }
  };

  // Set up message listener when iframe is ready
  useEffect(() => {
    if (previewState.status !== 'ready' || !previewState.url || !addElement) {
      return;
    }

    const listener = new ClickToComponentListener({
      onOpenInEditor: (payload) => {
        addElement(payload);
      },
      onReady: () => {
        setIsReady(true);
      },
    });

    listener.start();
    listenerRef.current = listener;

    return () => {
      listener.stop();
      listenerRef.current = null;
    };
  }, [previewState.status, previewState.url, addElement]);

  // If the preview status isn't ready, and it's been five seconds and we haven't received a ready message, set notReadyInTime true
  useEffect(() => {
    setTimeout(() => {
      setLoadingTimeFinished(true);
    }, 5000);
  }, []);

  // Auto-show logs when having trouble loading preview
  useEffect(() => {
    if (
      loadingTimeFinished &&
      !isReady &&
      latestDevServerProcess &&
      !showLogs
    ) {
      setShowLogs(true);
    }
  }, [loadingTimeFinished, isReady, latestDevServerProcess, showLogs]);

  // Compute mode and unified logs handling
  const mode = !runningDevServer ? 'noServer' : iframeError ? 'error' : 'ready';
  const toggleLogs = () => {
    setShowLogs((v) => !v);
  };

  const handleStartDevServer = () => {
    setLoadingTimeFinished(false);
    startDevServer();
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(
      'Please install https://github.com/BloopAI/vibe-kanban-web-companion'
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className={`flex-1 flex flex-col min-h-0`}>
        {mode === 'ready' ? (
          <>
            <PreviewToolbar
              mode={mode}
              url={previewState.url}
              onRefresh={handleRefresh}
              onCopyUrl={handleCopyUrl}
            />
            <ReadyContent
              url={previewState.url}
              iframeKey={`${previewState.url}-${refreshKey}`}
              onIframeError={handleIframeError}
            />
          </>
        ) : (
          <NoServerContent
            effectiveHasDevScript={effectiveHasDevScript}
            placeholders={placeholders}
            runningDevServer={runningDevServer}
            isStartingDevServer={isStartingDevServer}
            startDevServer={handleStartDevServer}
            stopDevServer={stopDevServer}
            project={project}
            projectId={projectId}
            queryClient={queryClient}
            setDevScriptAdded={setDevScriptAdded}
          />
        )}

        {mode === 'ready' && loadingTimeFinished && !isReady && (
          <Alert variant="destructive" className="space-y-2">
            <p className="font-bold">
              We're having trouble previewing your application:
            </p>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Did the dev server start successfully? There may be a bug you
                need to resolve, or perhaps dependencies need to be installed.
              </li>
              <li>
                Did your dev server print the URL and port to the terminal in
                the format <code>http://localhost:3000</code>? (this is how we
                know it's running)
              </li>
              <li>
                Have you installed the Web Companion (required for
                click-to-edit)? If not, please{' '}
                <a
                  href="https://github.com/BloopAI/vibe-kanban-web-companion"
                  target="_blank"
                  className="underline font-bold"
                >
                  follow the installation instructions here
                </a>
                .
              </li>
            </ol>
            <p className="border-2 p-2">
              <p>
                Tip: you can ask your coding agent to install the Web Companion
                for you with the prompt:{' '}
                <code className="font-bold">
                  Please install
                  https://github.com/BloopAI/vibe-kanban-web-companion
                </code>{' '}
                <Button
                  variant="ghost"
                  className="p-0 h-0"
                  onClick={copyPrompt}
                >
                  <Copy className="w-3 h-3" />
                </Button>
              </p>
            </p>
            <p>Please resolve any issues and restart the dev server.</p>
          </Alert>
        )}
        <DevServerLogsView
          latestDevServerProcess={latestDevServerProcess}
          showLogs={showLogs}
          onToggle={toggleLogs}
          showToggleText
        />
      </div>
    </div>
  );
}
