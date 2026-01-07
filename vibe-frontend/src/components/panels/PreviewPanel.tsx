import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDevserverPreview } from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { useLogStream } from '@/hooks/useLogStream';
import { useDevserverUrlFromLogs } from '@/hooks/useDevserverUrl';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { Alert } from '@/components/ui/alert';
import { useProject } from '@/contexts/ProjectContext';
import { DevServerLogsView } from '@/components/tasks/TaskDetails/preview/DevServerLogsView';
import { PreviewToolbar } from '@/components/tasks/TaskDetails/preview/PreviewToolbar';
import { NoServerContent } from '@/components/tasks/TaskDetails/preview/NoServerContent';
import { ReadyContent } from '@/components/tasks/TaskDetails/preview/ReadyContent';

export function PreviewPanel() {
  const [iframeError, setIframeError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadingTimeFinished, setLoadingTimeFinished] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const listenerRef = useRef<ClickToComponentListener | null>(null);

  const { t } = useTranslation('tasks');
  const { project, projectId } = useProject();
  const { attemptId: rawAttemptId } = useParams<{ attemptId?: string }>();

  const attemptId =
    rawAttemptId && rawAttemptId !== 'latest' ? rawAttemptId : undefined;
  const projectHasDevScript = Boolean(project?.dev_script);

  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    isStopping: isStoppingDevServer,
    runningDevServer,
    latestDevServerProcess,
  } = useDevServer(attemptId);

  const logStream = useLogStream(latestDevServerProcess?.id ?? '');
  const lastKnownUrl = useDevserverUrlFromLogs(logStream.logs);

  const previewState = useDevserverPreview(attemptId, {
    projectHasDevScript,
    projectId: projectId!,
    lastKnownUrl,
  });

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
        setShowLogs(false);
        setShowHelp(false);
      },
    });

    listener.start();
    listenerRef.current = listener;

    return () => {
      listener.stop();
      listenerRef.current = null;
    };
  }, [previewState.status, previewState.url, addElement]);

  function startTimer() {
    setLoadingTimeFinished(false);
    setTimeout(() => {
      setLoadingTimeFinished(true);
    }, 5000);
  }

  useEffect(() => {
    startTimer();
  }, []);

  useEffect(() => {
    if (
      loadingTimeFinished &&
      !isReady &&
      latestDevServerProcess &&
      runningDevServer
    ) {
      setShowHelp(true);
      setShowLogs(true);
      setLoadingTimeFinished(false);
    }
  }, [loadingTimeFinished, isReady, latestDevServerProcess, runningDevServer]);

  const isPreviewReady =
    previewState.status === 'ready' &&
    Boolean(previewState.url) &&
    !iframeError;
  const mode = iframeError
    ? 'error'
    : isPreviewReady
      ? 'ready'
      : runningDevServer
        ? 'searching'
        : 'noServer';
  const toggleLogs = () => {
    setShowLogs((v) => !v);
  };

  const handleStartDevServer = () => {
    setLoadingTimeFinished(false);
    startDevServer();
    startTimer();
    setShowHelp(false);
    setIsReady(false);
  };

  const handleStopAndEdit = () => {
    stopDevServer(undefined, {
      onSuccess: () => {
        setShowHelp(false);
      },
    });
  };

  if (!attemptId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">{t('preview.title')}</p>
          <p className="text-sm mt-2">{t('preview.selectAttempt')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={`flex-1 flex flex-col min-h-0`}>
        {mode === 'ready' ? (
          <>
            <PreviewToolbar
              mode={mode}
              url={previewState.url}
              onRefresh={handleRefresh}
              onCopyUrl={handleCopyUrl}
              onStop={stopDevServer}
              isStopping={isStoppingDevServer}
            />
            <ReadyContent
              url={previewState.url}
              iframeKey={`${previewState.url}-${refreshKey}`}
              onIframeError={handleIframeError}
            />
          </>
        ) : (
          <NoServerContent
            projectHasDevScript={projectHasDevScript}
            runningDevServer={runningDevServer}
            isStartingDevServer={isStartingDevServer}
            startDevServer={handleStartDevServer}
            stopDevServer={stopDevServer}
            project={project}
          />
        )}

        {showHelp && (
          <Alert variant="destructive" className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-2">
                <p className="font-bold">{t('preview.troubleAlert.title')}</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>{t('preview.troubleAlert.item1')}</li>
                  <li>
                    {t('preview.troubleAlert.item2')}{' '}
                    <code>http://localhost:3000</code>
                    {t('preview.troubleAlert.item2Suffix')}
                  </li>
                  <li>
                    {t('preview.troubleAlert.item3')}{' '}
                    <a
                      href="https://github.com/BloopAI/vibe-kanban-web-companion"
                      target="_blank"
                      className="underline font-bold"
                    >
                      {t('preview.troubleAlert.item3Link')}
                    </a>
                    .
                  </li>
                </ol>
                <Button
                  variant="destructive"
                  onClick={handleStopAndEdit}
                  disabled={isStoppingDevServer}
                >
                  {isStoppingDevServer && (
                    <Loader2 className="mr-2 animate-spin" />
                  )}
                  {t('preview.noServer.stopAndEditButton')}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHelp(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </Alert>
        )}
        <DevServerLogsView
          latestDevServerProcess={latestDevServerProcess}
          showLogs={showLogs}
          onToggle={toggleLogs}
          showToggleText
          logs={logStream.logs}
          error={logStream.error}
        />
      </div>
    </div>
  );
}
