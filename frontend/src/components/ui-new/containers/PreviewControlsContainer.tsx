import { useCallback, useState, useEffect } from 'react';
import { PreviewControls } from '../views/PreviewControls';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { useLogStream } from '@/hooks/useLogStream';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useLogsPanel } from '@/contexts/LogsPanelContext';

interface PreviewControlsContainerProps {
  attemptId: string;
  className: string;
}

export function PreviewControlsContainer({
  attemptId,
  className,
}: PreviewControlsContainerProps) {
  const { repos } = useWorkspaceContext();
  const { viewProcessInPanel } = useLogsPanel();
  const setRightMainPanelMode = useUiPreferencesStore(
    (s) => s.setRightMainPanelMode
  );

  const { isStarting, runningDevServers, devServerProcesses } =
    usePreviewDevServer(attemptId);

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

  const handleViewFullLogs = useCallback(() => {
    const targetId = activeProcess?.id;
    if (targetId) {
      viewProcessInPanel(targetId);
    } else {
      setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.LOGS);
    }
  }, [activeProcess?.id, viewProcessInPanel, setRightMainPanelMode]);

  const handleTabChange = useCallback((processId: string) => {
    setActiveProcessId(processId);
  }, []);

  const hasDevScript = repos.some(
    (repo) => repo.dev_server_script && repo.dev_server_script.trim() !== ''
  );

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
      onViewFullLogs={handleViewFullLogs}
      onTabChange={handleTabChange}
      isStarting={isStarting}
      isServerRunning={runningDevServers.length > 0}
      className={className}
    />
  );
}
