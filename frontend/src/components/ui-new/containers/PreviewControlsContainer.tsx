import { useCallback } from 'react';
import { PreviewControls } from '../views/PreviewControls';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import { useLogStream } from '@/hooks/useLogStream';
import { useLayoutStore } from '@/stores/useLayoutStore';

interface PreviewControlsContainerProps {
  attemptId?: string;
  onViewProcessInPanel?: (processId: string) => void;
  className?: string;
}

export function PreviewControlsContainer({
  attemptId,
  onViewProcessInPanel,
  className,
}: PreviewControlsContainerProps) {
  const setLogsMode = useLayoutStore((s) => s.setLogsMode);
  const triggerPreviewRefresh = useLayoutStore((s) => s.triggerPreviewRefresh);

  const {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServer,
    latestDevServerProcess,
  } = usePreviewDevServer(attemptId);

  const { logs } = useLogStream(latestDevServerProcess?.id ?? '');
  const urlInfo = usePreviewUrl(logs);

  const handleViewFullLogs = useCallback(() => {
    if (latestDevServerProcess?.id && onViewProcessInPanel) {
      // Switch to logs mode and select the dev server process
      onViewProcessInPanel(latestDevServerProcess.id);
    } else {
      // Just switch to logs mode if no process to select
      setLogsMode(true);
    }
  }, [latestDevServerProcess?.id, onViewProcessInPanel, setLogsMode]);

  const handleStart = useCallback(() => {
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleRefresh = useCallback(() => {
    triggerPreviewRefresh();
  }, [triggerPreviewRefresh]);

  const handleCopyUrl = useCallback(async () => {
    if (urlInfo?.url) {
      await navigator.clipboard.writeText(urlInfo.url);
    }
  }, [urlInfo?.url]);

  const handleOpenInNewTab = useCallback(() => {
    if (urlInfo?.url) {
      window.open(urlInfo.url, '_blank');
    }
  }, [urlInfo?.url]);

  return (
    <PreviewControls
      logs={logs}
      url={urlInfo?.url}
      onViewFullLogs={handleViewFullLogs}
      onStart={handleStart}
      onStop={handleStop}
      onRefresh={handleRefresh}
      onCopyUrl={handleCopyUrl}
      onOpenInNewTab={handleOpenInNewTab}
      isStarting={isStarting}
      isStopping={isStopping}
      hasDevScript={true}
      isServerRunning={Boolean(runningDevServer)}
      className={className}
    />
  );
}
