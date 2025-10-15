import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDevserverPreview } from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { TaskAttempt } from 'shared/types';
import { Alert } from '@/components/ui/alert';
import { useProject } from '@/contexts/project-context';
import { DevServerLogsView } from './preview/DevServerLogsView';
import { PreviewToolbar } from './preview/PreviewToolbar';
import { NoServerContent } from './preview/NoServerContent';
import { ReadyContent } from './preview/ReadyContent';

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
  const [showHelp, setShowHelp] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const listenerRef = useRef<ClickToComponentListener | null>(null);

  // Hooks
  const { t } = useTranslation('tasks');
  const { project } = useProject();

  const previewState = useDevserverPreview(selectedAttempt.id, {
    projectHasDevScript,
    projectId,
  });

  const {
    start: startDevServer,
    stop: stopDevServer,
    isStarting: isStartingDevServer,
    isStopping: isStoppingDevServer,
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

  // Auto-show help alert when having trouble loading preview
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
  }, [
    loadingTimeFinished,
    isReady,
    latestDevServerProcess?.id,
    runningDevServer,
  ]);

  // Compute mode and unified logs handling
  const mode = !runningDevServer ? 'noServer' : iframeError ? 'error' : 'ready';
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
        />
      </div>
    </div>
  );
}
