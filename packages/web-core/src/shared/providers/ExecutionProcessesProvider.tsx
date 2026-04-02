import React, { useEffect, useMemo, useRef } from 'react';
import { useExecutionProcesses } from '@/shared/hooks/useExecutionProcesses';
import type { ExecutionProcess } from 'shared/types';
import { useExecutionProcessesStore } from '@/shared/stores/useExecutionProcessesStore';

export const ExecutionProcessesProvider: React.FC<{
  sessionId?: string | undefined;
  children: React.ReactNode;
}> = ({ sessionId, children }) => {
  const {
    executionProcesses,
    executionProcessesById,
    isAttemptRunning,
    isLoading,
    isConnected,
    error,
  } = useExecutionProcesses(sessionId, { showSoftDeleted: true });

  const visible = useMemo(() => {
    return executionProcesses.filter((p) => !p.dropped);
  }, [executionProcesses]);

  const executionProcessesByIdVisible = useMemo(() => {
    const m: Record<string, ExecutionProcess> = {};
    for (const p of visible) m[p.id] = p;
    return m;
  }, [visible]);

  const isAttemptRunningVisible = useMemo(
    () =>
      visible.some(
        (process) =>
          (process.run_reason === 'codingagent' ||
            process.run_reason === 'cleanupscript' ||
            process.run_reason === 'archivescript') &&
          process.status === 'running'
      ),
    [visible]
  );

  // Update store synchronously during render so children always see current
  // data. This restores the timing that React Context provided before the
  // Zustand migration (06a6ae18b). Using useEffect deferred the update until
  // after children's effects, causing them to read stale execution processes
  // from the previous session/workspace.
  const prevDepsRef = useRef<unknown[]>([]);
  const deps = [
    executionProcesses,
    executionProcessesById,
    isAttemptRunning,
    visible,
    executionProcessesByIdVisible,
    isAttemptRunningVisible,
    isLoading,
    isConnected,
    error,
  ];
  if (deps.some((d, i) => d !== prevDepsRef.current[i])) {
    prevDepsRef.current = deps;
    useExecutionProcessesStore.getState().setExecutionProcessesData({
      executionProcessesAll: executionProcesses,
      executionProcessesByIdAll: executionProcessesById,
      isAttemptRunningAll: isAttemptRunning,
      executionProcessesVisible: visible,
      executionProcessesByIdVisible,
      isAttemptRunningVisible,
      isLoading,
      isConnected,
      error,
    });
  }

  useEffect(() => {
    return () => {
      useExecutionProcessesStore.getState().clearExecutionProcessesData();
    };
  }, []);

  return <>{children}</>;
};
