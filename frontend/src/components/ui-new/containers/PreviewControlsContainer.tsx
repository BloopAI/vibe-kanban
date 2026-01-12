import { useCallback, useState, useEffect } from 'react';
import { PreviewControls } from '../views/PreviewControls';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import { useLogStream } from '@/hooks/useLogStream';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { ScriptFixerDialog } from '@/components/dialogs/scripts/ScriptFixerDialog';

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
  const { repos } = useWorkspaceContext();
  const setLogsMode = useLayoutStore((s) => s.setLogsMode);
  const triggerPreviewRefresh = useLayoutStore((s) => s.triggerPreviewRefresh);

  const {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServers,
    devServerProcesses,
  } = usePreviewDevServer(attemptId);

  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);

  useEffect(() => {
    if (devServerProcesses.length > 0 && !activeProcessId) {
      setActiveProcessId(devServerProcesses[0].id);
    }
  }, [devServerProcesses, activeProcessId]);

  const activeProcess =
    devServerProcesses.find((p) => p.id === activeProcessId) ??
    devServerProcesses[0];

  const { logs, error: logsError } = useLogStream(activeProcess?.id ?? '');

  const primaryDevServer = runningDevServers[0];
  const { logs: primaryLogs } = useLogStream(primaryDevServer?.id ?? '');
  const urlInfo = usePreviewUrl(primaryLogs);

  const handleViewFullLogs = useCallback(
    (processId?: string) => {
      const targetId = processId ?? activeProcess?.id;
      if (targetId && onViewProcessInPanel) {
        onViewProcessInPanel(targetId);
      } else {
        setLogsMode(true);
      }
    },
    [activeProcess?.id, onViewProcessInPanel, setLogsMode]
  );

  const handleTabChange = useCallback((processId: string) => {
    setActiveProcessId(processId);
  }, []);

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

  const handleFixScript = useCallback(() => {
    if (!attemptId || repos.length === 0) return;

    // Get session ID from the latest dev server process
    const sessionId = devServerProcesses[0]?.session_id;

    ScriptFixerDialog.show({
      scriptType: 'dev_server',
      repos,
      workspaceId: attemptId,
      sessionId,
      initialRepoId: repos.length === 1 ? repos[0].id : undefined,
    });
  }, [attemptId, repos, devServerProcesses]);

  const hasDevScript = repos.some(
    (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
  );

  // Only show "Fix Script" button when the latest dev server process failed
  const latestDevServerFailed =
    devServerProcesses.length > 0 && devServerProcesses[0]?.status === 'failed';

  // Don't render if no repos have dev server scripts configured
  if (!hasDevScript) {
    return null;
  }

  return (
    <PreviewControls
      devServerProcesses={devServerProcesses}
      activeProcessId={activeProcess?.id ?? null}
      logs={logs}
      logsError={logsError}
      url={urlInfo?.url}
      onViewFullLogs={handleViewFullLogs}
      onTabChange={handleTabChange}
      onStart={handleStart}
      onStop={handleStop}
      onRefresh={handleRefresh}
      onCopyUrl={handleCopyUrl}
      onOpenInNewTab={handleOpenInNewTab}
      onFixScript={
        attemptId && repos.length > 0 && latestDevServerFailed
          ? handleFixScript
          : undefined
      }
      isStarting={isStarting}
      isStopping={isStopping}
      isServerRunning={runningDevServers.length > 0}
      className={className}
    />
  );
}
