import { useCallback, useMemo } from 'react';
import { useExecutionProcessesContext } from '@/features/workspace-chat/model/contexts/ExecutionProcessesContext';
import { useWorkspaceContext } from '@/contexts/WorkspaceContext';
import { useBranchStatus } from '@/features/workspace/model/hooks/useBranchStatus';
import { isCodingAgent } from '@/shared/constants/processes';
import { useResetProcessMutation } from '@/features/workspace-chat/model/hooks/useResetProcessMutation';

export interface UseResetProcessResult {
  resetProcess: (executionProcessId: string) => void;
  canResetProcess: (executionProcessId: string) => boolean;
  isResetPending: boolean;
}

export function useResetProcess(): UseResetProcessResult {
  const { workspaceId, selectedSessionId } = useWorkspaceContext();
  const { data: branchStatus } = useBranchStatus(workspaceId);
  const { executionProcessesAll: processes } = useExecutionProcessesContext();

  const resetMutation = useResetProcessMutation(selectedSessionId ?? '');
  const isResetPending = resetMutation.isPending;

  const firstCodingProcessId = useMemo(
    () =>
      processes.find(
        (process) => !process.dropped && isCodingAgent(process.run_reason)
      )?.id,
    [processes]
  );

  const canResetProcess = useCallback(
    (executionProcessId: string) =>
      !!firstCodingProcessId && executionProcessId !== firstCodingProcessId,
    [firstCodingProcessId]
  );

  const resetProcess = useCallback(
    (executionProcessId: string) => {
      if (!selectedSessionId) return;
      resetMutation.mutate({
        executionProcessId,
        branchStatus,
        processes,
      });
    },
    [branchStatus, processes, resetMutation, selectedSessionId]
  );

  return useMemo(
    () => ({
      resetProcess,
      canResetProcess,
      isResetPending,
    }),
    [resetProcess, canResetProcess, isResetPending]
  );
}
