import { useQuery } from '@tanstack/react-query';
import { executionProcessesApi } from '@/lib/api';
import type { ExecutionProcess } from 'shared/types';

export function useExecutionProcesses(attemptId?: string) {
  const query = useQuery({
    queryKey: ['executionProcesses', attemptId],
    queryFn: () => executionProcessesApi.getExecutionProcesses(attemptId!),
    enabled: !!attemptId,
    refetchInterval: () => {
      // Always poll every 5 seconds when enabled - we'll control this via enabled
      return 5000;
    },
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

  return query;
}
