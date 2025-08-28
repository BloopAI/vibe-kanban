import { useMemo, useCallback } from 'react';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import { useTaskStopping } from '@/stores/useTaskDetailsUiStore';
import type { AttemptData } from '@/lib/types';
import type { ExecutionProcess } from 'shared/types';

export function useAttemptExecution(attemptId?: string, taskId?: string) {
  const queryClient = useQueryClient();
  const { isStopping, setIsStopping } = useTaskStopping(taskId || '');

  // Main execution processes query with polling
  const {
    data: executionData,
    isLoading: processesLoading,
    isFetching: processesFetching,
    refetch,
  } = useQuery({
    queryKey: ['executionProcesses', attemptId],
    queryFn: () => executionProcessesApi.getExecutionProcesses(attemptId!),
    enabled: !!attemptId,
    refetchInterval: 5000,
    select: (data) => ({
      processes: data,
      isAttemptRunning: data.some(
        (process: ExecutionProcess) =>
          (process.run_reason === 'codingagent' ||
            process.run_reason === 'setupscript' ||
            process.run_reason === 'cleanupscript') &&
          process.status === 'running'
      ),
    }),
  });

  // Get setup script processes that need detailed info
  const setupProcesses = useMemo(() => {
    if (!executionData?.processes) return [];
    return executionData.processes.filter(
      (p) => p.run_reason === 'setupscript'
    );
  }, [executionData?.processes]);

  // Fetch details for setup processes
  const processDetailQueries = useQueries({
    queries: setupProcesses.map((process) => ({
      queryKey: ['processDetails', process.id],
      queryFn: () => executionProcessesApi.getDetails(process.id),
      enabled: !!process.id,
    })),
  });

  // Build attempt data combining processes and details
  const attemptData: AttemptData = useMemo(() => {
    if (!executionData?.processes) {
      return { processes: [], runningProcessDetails: {} };
    }

    // Build runningProcessDetails from the detail queries
    const runningProcessDetails: Record<string, ExecutionProcess> = {};

    setupProcesses.forEach((process, index) => {
      const detailQuery = processDetailQueries[index];
      if (detailQuery?.data) {
        runningProcessDetails[process.id] = detailQuery.data;
      }
    });

    return {
      processes: executionData.processes,
      runningProcessDetails,
    };
  }, [executionData?.processes, setupProcesses, processDetailQueries]);

  // Stop execution function
  const stopExecution = useCallback(async () => {
    if (!attemptId || !executionData?.isAttemptRunning || isStopping) return;

    try {
      setIsStopping(true);
      await attemptsApi.stop(attemptId);

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({
        queryKey: ['executionProcesses', attemptId],
      });
    } catch (error) {
      console.error('Failed to stop executions:', error);
      throw error;
    } finally {
      setIsStopping(false);
    }
  }, [
    attemptId,
    executionData?.isAttemptRunning,
    isStopping,
    setIsStopping,
    queryClient,
  ]);

  const isLoading =
    processesLoading || processDetailQueries.some((q) => q.isLoading);
  const isFetching =
    processesFetching || processDetailQueries.some((q) => q.isFetching);

  return {
    // Data
    processes: executionData?.processes || [],
    attemptData,
    runningProcessDetails: attemptData.runningProcessDetails,

    // Status
    isAttemptRunning: executionData?.isAttemptRunning ?? false,
    isLoading,
    isFetching,

    // Actions
    stopExecution,
    isStopping,
    refetch,
  };
}
