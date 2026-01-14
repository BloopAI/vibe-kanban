import { useCallback, useState, useEffect } from 'react';
import { PreviewControls } from '../views/PreviewControls';
import { usePreviewDevServer } from '../hooks/usePreviewDevServer';
import { useLogStream } from '@/hooks/useLogStream';
import {
  useUiPreferencesStore,
  RIGHT_MAIN_PANEL_MODES,
} from '@/stores/useUiPreferencesStore';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';

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

  const handleViewFullLogs = useCallback(
    (processId?: string) => {
      const targetId = processId ?? activeProcess?.id;
      if (targetId && onViewProcessInPanel) {
        onViewProcessInPanel(targetId);
      } else {
        setRightMainPanelMode(RIGHT_MAIN_PANEL_MODES.LOGS);
      }
    },
    [activeProcess?.id, onViewProcessInPanel, setRightMainPanelMode]
  );

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
