import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDevserverPreview } from '@/hooks/useDevserverPreview';
import { useDevServer } from '@/hooks/useDevServer';
import { ClickToComponentListener } from '@/utils/previewBridge';
import { useClickedElements } from '@/contexts/ClickedElementsProvider';
import { TaskAttempt } from 'shared/types';
import { Alert } from '@/components/ui/alert';
import { useUserSystem } from '@/components/config-provider';
import {
  createScriptPlaceholderStrategy,
  ScriptPlaceholderContext,
} from '@/utils/script-placeholders';
import { useQueryClient } from '@tanstack/react-query';
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const listenerRef = useRef<ClickToComponentListener | null>(null);

  // Hooks
  const { t } = useTranslation('tasks');
  const { project } = useProject();
  const { system } = useUserSystem();

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
    projectHasDevScript,
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
    navigator.clipboard.writeText(t('preview.troubleAlert.tipCommand'));
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
            placeholders={placeholders}
            runningDevServer={runningDevServer}
            isStartingDevServer={isStartingDevServer}
            startDevServer={handleStartDevServer}
            stopDevServer={stopDevServer}
            project={project}
          />
        )}

        {mode === 'ready' && loadingTimeFinished && !isReady && (
          <Alert variant="destructive" className="space-y-2">
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
            <p className="border-2 p-2">
              <p>
                {t('preview.troubleAlert.tipPrompt')}{' '}
                <code className="font-bold">
                  {t('preview.troubleAlert.tipCommand')}
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
            <p>{t('preview.troubleAlert.resolve')}</p>
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
