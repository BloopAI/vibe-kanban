import { useCallback, useState, useEffect, useRef } from 'react';
import { PreviewControls } from '../views/PreviewControls';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { usePreviewUrl } from '../hooks/usePreviewUrl';
import { usePreviewUrlOverride } from '@/hooks/usePreviewUrlOverride';
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
  const { repos, workspaceId } = useWorkspaceContext();
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

  // URL override for this workspace
  const { overrideUrl, setOverrideUrl, clearOverride, hasOverride } =
    usePreviewUrlOverride(workspaceId);

  // Use override URL if set, otherwise fall back to auto-detected
  const effectiveUrl = hasOverride ? overrideUrl : urlInfo?.url;

  // Local state for URL input to prevent WebSocket updates from disrupting typing
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [urlInputValue, setUrlInputValue] = useState(effectiveUrl ?? '');

  // Sync from prop only when input is not focused
  useEffect(() => {
    if (document.activeElement !== urlInputRef.current) {
      setUrlInputValue(effectiveUrl ?? '');
    }
  }, [effectiveUrl]);

  const handleUrlInputChange = useCallback(
    (value: string) => {
      setUrlInputValue(value);
      setOverrideUrl(value);
    },
    [setOverrideUrl]
  );

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

  const handleClearOverride = useCallback(async () => {
    await clearOverride();
  }, [clearOverride]);

  const handleCopyUrl = useCallback(async () => {
    if (effectiveUrl) {
      await navigator.clipboard.writeText(effectiveUrl);
    }
  }, [effectiveUrl]);

  const handleOpenInNewTab = useCallback(() => {
    if (effectiveUrl) {
      window.open(effectiveUrl, '_blank');
    }
  }, [effectiveUrl]);

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
      url={effectiveUrl ?? undefined}
      autoDetectedUrl={urlInfo?.url}
      isUsingOverride={hasOverride}
      urlInputValue={urlInputValue}
      urlInputRef={urlInputRef}
      onUrlInputChange={handleUrlInputChange}
      onClearOverride={handleClearOverride}
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
