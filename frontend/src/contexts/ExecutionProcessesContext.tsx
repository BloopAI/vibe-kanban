import React, { createContext, useContext, useMemo } from 'react';
import { useExecutionProcesses } from '@/hooks/useExecutionProcesses';
import type { ExecutionProcess } from 'shared/types';

type ExecutionProcessesContextType = {
  executionProcessesAll: ExecutionProcess[];
  executionProcessesByIdAll: Record<string, ExecutionProcess>;
  isAttemptRunningAll: boolean;

  executionProcessesVisible: ExecutionProcess[];
  executionProcessesByIdVisible: Record<string, ExecutionProcess>;
  isAttemptRunningVisible: boolean;

  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
};

const ExecutionProcessesContext =
  createContext<ExecutionProcessesContextType | null>(null);

export const ExecutionProcessesProvider: React.FC<{
  attemptId: string | undefined;
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

  // 単一のuseMemoで全ての派生値を計算（チェーン計算を削減）
  const value = useMemo<ExecutionProcessesContextType>(() => {
    // Filter out dropped processes
    const visible = executionProcesses.filter((p) => !p.dropped);

    // Build visible lookup map
    const executionProcessesByIdVisible: Record<string, ExecutionProcess> = {};
    for (const p of visible) {
      executionProcessesByIdVisible[p.id] = p;
    }

    // Check if any visible process is running
    const isAttemptRunningVisible = visible.some(
      (process) =>
        (process.run_reason === 'codingagent' ||
          process.run_reason === 'setupscript' ||
          process.run_reason === 'cleanupscript') &&
        process.status === 'running'
    );

    return {
      executionProcessesAll: executionProcesses,
      executionProcessesByIdAll: executionProcessesById,
      isAttemptRunningAll: isAttemptRunning,
      executionProcessesVisible: visible,
      executionProcessesByIdVisible,
      isAttemptRunningVisible,
      isLoading,
      isConnected,
      error,
    };
  }, [executionProcesses, executionProcessesById, isAttemptRunning, isLoading, isConnected, error]);

  return (
    <ExecutionProcessesContext.Provider value={value}>
      {children}
    </ExecutionProcessesContext.Provider>
  );
};

export const useExecutionProcessesContext = () => {
  const ctx = useContext(ExecutionProcessesContext);
  if (!ctx) {
    throw new Error(
      'useExecutionProcessesContext must be used within ExecutionProcessesProvider'
    );
  }
  return ctx;
};
