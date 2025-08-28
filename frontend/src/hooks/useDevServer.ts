import { useCallback, useMemo, useState } from 'react';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import type { ExecutionProcess } from 'shared/types';

interface UseDevServerOptions {
  onStartSuccess?: () => void;
  onStartError?: (err: unknown) => void;
  onStopSuccess?: () => void;
  onStopError?: (err: unknown) => void;
}

export function useDevServer(
  attemptId: string | undefined,
  options?: UseDevServerOptions
) {
  const { attemptData } = useAttemptExecution(attemptId);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Find running dev server process
  const runningDevServer = useMemo((): ExecutionProcess | undefined => {
    return attemptData.processes.find(
      (process) =>
        process.run_reason === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  // Find latest dev server process (for logs viewing)
  const latestDevServerProcess = useMemo((): ExecutionProcess | undefined => {
    return [...attemptData.processes]
      .filter((process) => process.run_reason === 'devserver')
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )[0];
  }, [attemptData.processes]);

  const start = useCallback(async () => {
    if (!attemptId) return;

    setIsStarting(true);
    try {
      await attemptsApi.startDevServer(attemptId);
      options?.onStartSuccess?.();
    } catch (err) {
      console.error('Failed to start dev server:', err);
      options?.onStartError?.(err);
    } finally {
      setIsStarting(false);
    }
  }, [attemptId, options?.onStartSuccess, options?.onStartError]);

  const stop = useCallback(async () => {
    if (!runningDevServer) return;

    setIsStopping(true);
    try {
      await executionProcessesApi.stopExecutionProcess(runningDevServer.id);
      options?.onStopSuccess?.();
    } catch (err) {
      console.error('Failed to stop dev server:', err);
      options?.onStopError?.(err);
    } finally {
      setIsStopping(false);
    }
  }, [runningDevServer, options?.onStopSuccess, options?.onStopError]);

  return {
    start,
    stop,
    isStarting,
    isStopping,
    runningDevServer,
    latestDevServerProcess,
  };
}
