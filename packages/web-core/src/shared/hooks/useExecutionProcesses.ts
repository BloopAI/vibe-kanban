import { useCallback, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useJsonPatchWsStream } from '@/shared/hooks/useJsonPatchWsStream';
import { useHostId } from '@/shared/providers/HostIdProvider';
import { executionProcessesApi } from '@/shared/lib/api';
import { ExecutionProcessStatus, type ExecutionProcess } from 'shared/types';

type ExecutionProcessState = {
  execution_processes: Record<string, ExecutionProcess>;
};

const RUNNING_PROCESS_RECONCILE_INTERVAL_MS = 3000;

function isBlockingRunningProcess(process: ExecutionProcess): boolean {
  return (
    (process.run_reason === 'codingagent' ||
      process.run_reason === 'setupscript' ||
      process.run_reason === 'cleanupscript' ||
      process.run_reason === 'archivescript') &&
    process.status === ExecutionProcessStatus.running
  );
}

interface UseExecutionProcessesResult {
  executionProcesses: ExecutionProcess[];
  executionProcessesById: Record<string, ExecutionProcess>;
  isAttemptRunning: boolean;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream execution processes for a session via WebSocket (JSON Patch) and expose as array + map.
 * Server sends initial snapshot: replace /execution_processes with an object keyed by id.
 * Live updates arrive at /execution_processes/<id> via add/replace/remove operations.
 */
export const useExecutionProcesses = (
  sessionId: string | undefined,
  opts?: { showSoftDeleted?: boolean }
): UseExecutionProcessesResult => {
  const hostId = useHostId();
  const showSoftDeleted = opts?.showSoftDeleted;
  let endpoint: string | undefined;

  if (sessionId) {
    const apiBasePath = hostId ? `/api/host/${hostId}` : '/api';
    const params = new URLSearchParams({ session_id: sessionId });
    if (typeof showSoftDeleted === 'boolean') {
      params.set('show_soft_deleted', String(showSoftDeleted));
    }
    endpoint = `${apiBasePath}/execution-processes/stream/session/ws?${params.toString()}`;
  }

  const initialData = useCallback(
    (): ExecutionProcessState => ({ execution_processes: {} }),
    []
  );

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<ExecutionProcessState>(
      endpoint,
      !!sessionId,
      initialData,
      { reconnectOnCleanClose: true }
    );

  const streamedExecutionProcesses = Object.values(
    data?.execution_processes ?? {}
  ).sort(
    (a, b) =>
      new Date(a.created_at as unknown as string).getTime() -
      new Date(b.created_at as unknown as string).getTime()
  );

  // Guard against stale buffered stream data when switching sessions quickly.
  const scopedExecutionProcesses = sessionId
    ? streamedExecutionProcesses.filter(
        (executionProcess) => executionProcess.session_id === sessionId
      )
    : streamedExecutionProcesses;

  const runningProcessIds = useMemo(
    () =>
      scopedExecutionProcesses
        .filter(isBlockingRunningProcess)
        .map((process) => process.id)
        .sort(),
    [scopedExecutionProcesses]
  );

  const runningProcessDetailQueries = useQueries({
    queries: runningProcessIds.map((processId) => ({
      queryKey: ['executionProcess', processId, 'running-reconcile', hostId],
      queryFn: () => executionProcessesApi.getDetails(processId),
      enabled: !!sessionId,
      staleTime: 0,
      refetchInterval: RUNNING_PROCESS_RECONCILE_INTERVAL_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
    })),
  });

  const executionProcesses = useMemo(() => {
    if (!runningProcessDetailQueries.length) {
      return scopedExecutionProcesses;
    }

    const detailById = new Map<string, ExecutionProcess>();
    for (const query of runningProcessDetailQueries) {
      const process = query.data;
      if (!process || (sessionId && process.session_id !== sessionId)) {
        continue;
      }
      detailById.set(process.id, process);
    }

    if (detailById.size === 0) {
      return scopedExecutionProcesses;
    }

    return scopedExecutionProcesses.map((process) => {
      if (!isBlockingRunningProcess(process)) {
        return process;
      }

      const detail = detailById.get(process.id);
      if (!detail) {
        return process;
      }

      return detail;
    });
  }, [scopedExecutionProcesses, runningProcessDetailQueries, sessionId]);

  const executionProcessesById = executionProcesses.reduce<
    Record<string, ExecutionProcess>
  >((processesById, executionProcess) => {
    processesById[executionProcess.id] = executionProcess;
    return processesById;
  }, {});

  const isAttemptRunning = executionProcesses.some(
    (process) =>
      (process.run_reason === 'codingagent' ||
        process.run_reason === 'setupscript' ||
        process.run_reason === 'cleanupscript' ||
        process.run_reason === 'archivescript') &&
      process.status === 'running'
  );
  const isLoading = !!sessionId && !isInitialized && !error; // until first snapshot

  return {
    executionProcesses,
    executionProcessesById,
    isAttemptRunning,
    isLoading,
    isConnected,
    error,
  };
};
