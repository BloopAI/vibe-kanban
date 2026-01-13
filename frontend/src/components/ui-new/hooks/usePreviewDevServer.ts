import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useWorkspaceDevServers } from '@/hooks/useWorkspaceDevServers';
import { workspaceSummaryKeys } from '@/components/ui-new/hooks/useWorkspaces';
import { deduplicateDevServersByWorkingDir } from '@/lib/devServerUtils';

interface UsePreviewDevServerOptions {
  onStartSuccess?: () => void;
  onStartError?: (err: unknown) => void;
  onStopSuccess?: () => void;
  onStopError?: (err: unknown) => void;
}

export function usePreviewDevServer(
  workspaceId: string | undefined,
  options?: UsePreviewDevServerOptions
) {
  const queryClient = useQueryClient();

  // Use workspace-scoped dev server streaming (visible across all sessions)
  const { devServers, runningDevServers } = useWorkspaceDevServers(workspaceId);

  const devServerProcesses = useMemo(
    () => deduplicateDevServersByWorkingDir(devServers),
    [devServers]
  );

  const startMutation = useMutation({
    mutationKey: ['startDevServer', workspaceId],
    mutationFn: async () => {
      if (!workspaceId) return;
      await attemptsApi.startDevServer(workspaceId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspaceDevServers', workspaceId],
      });
      queryClient.invalidateQueries({ queryKey: workspaceSummaryKeys.all });
      options?.onStartSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to start dev server:', err);
      options?.onStartError?.(err);
    },
  });

  const stopMutation = useMutation({
    mutationKey: ['stopDevServer', workspaceId],
    mutationFn: async () => {
      if (runningDevServers.length === 0) return;
      await Promise.all(
        runningDevServers.map((ds) =>
          executionProcessesApi.stopExecutionProcess(ds.id)
        )
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspaceDevServers', workspaceId],
      });
      for (const ds of runningDevServers) {
        queryClient.invalidateQueries({
          queryKey: ['processDetails', ds.id],
        });
      }
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
    runningDevServers,
    devServerProcesses,
  };
}
