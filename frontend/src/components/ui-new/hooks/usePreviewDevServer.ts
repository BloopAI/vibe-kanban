import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import type { ExecutionProcess } from 'shared/types';

interface UsePreviewDevServerOptions {
  onStartSuccess?: () => void;
  onStartError?: (err: unknown) => void;
  onStopSuccess?: () => void;
  onStopError?: (err: unknown) => void;
}

export function usePreviewDevServer(
  attemptId: string | undefined,
  options?: UsePreviewDevServerOptions
) {
  const queryClient = useQueryClient();
  const { attemptData } = useAttemptExecution(attemptId);

  // Find running dev server process
  const runningDevServer = useMemo<ExecutionProcess | undefined>(() => {
    return attemptData.processes.find(
      (process) =>
        process.run_reason === 'devserver' && process.status === 'running'
    );
  }, [attemptData.processes]);

  // Find latest dev server process (for logs viewing)
  const latestDevServerProcess = useMemo<ExecutionProcess | undefined>(() => {
    return [...attemptData.processes]
      .filter((process) => process.run_reason === 'devserver')
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )[0];
  }, [attemptData.processes]);

  // Start mutation
  const startMutation = useMutation({
    mutationKey: ['startDevServer', attemptId],
    mutationFn: async () => {
      if (!attemptId) return;
      await attemptsApi.startDevServer(attemptId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['executionProcesses', attemptId],
      });
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      options?.onStartSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to start dev server:', err);
      options?.onStartError?.(err);
    },
  });

  // Stop mutation
  const stopMutation = useMutation({
    mutationKey: ['stopDevServer', runningDevServer?.id],
    mutationFn: async () => {
      if (!runningDevServer) return;
      await executionProcessesApi.stopExecutionProcess(runningDevServer.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['executionProcesses', attemptId],
        }),
        runningDevServer
          ? queryClient.invalidateQueries({
              queryKey: ['processDetails', runningDevServer.id],
            })
          : Promise.resolve(),
      ]);
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      options?.onStopSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to stop dev server:', err);
      options?.onStopError?.(err);
    },
  });

  return {
    start: startMutation.mutate,
    stop: stopMutation.mutate,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
    runningDevServer,
    latestDevServerProcess,
  };
}
