// hooks/useProcessRetry.ts
import { useCallback, useState } from 'react';
import { useAttemptExecution } from '@/hooks/useAttemptExecution';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import type {
  ExecutionProcess,
  TaskAttempt,
  ExecutorActionType,
} from 'shared/types';

/**
 * Reusable hook to retry a process given its executionProcessId and a new prompt.
 * Handles:
 *  - Preventing retry while anything is running (or that process is already running)
 *  - Optional worktree reset (via modal)
 *  - Variant extraction for coding-agent processes
 *  - Refetching attempt + branch data after replace
 */
export function useProcessRetry(attempt: TaskAttempt | undefined) {
  const attemptId = attempt?.id;

  // Fetch attempt + branch state the same way your component did
  const { attemptData, isAttemptRunning } = useAttemptExecution(attemptId);
  useBranchStatus(attemptId);

  const [busy, setBusy] = useState(false);

  // Convenience lookups
  const getProcessById = useCallback(
    (pid: string): ExecutionProcess | undefined =>
      (attemptData.processes || []).find((p) => p.id === pid),
    [attemptData.processes]
  );

  /**
   * Returns whether a process is currently allowed to retry, and why not.
   * Useful if you want to gray out buttons in any component.
   */
  const getRetryDisabledState = useCallback(
    (pid: string) => {
      const proc = getProcessById(pid);
      const isRunningProc = proc?.status === 'running';
      const disabled = busy || isAttemptRunning || isRunningProc;
      let reason: string | undefined;
      if (isRunningProc) reason = 'Finish or stop this run to retry.';
      else if (isAttemptRunning)
        reason = 'Cannot retry while an agent is running.';
      else if (busy) reason = 'Retry in progress.';
      return { disabled, reason };
    },
    [busy, isAttemptRunning, getProcessById]
  );

  /**
   * Primary entrypoint: retry a process with a new prompt.
   */
  // Initialize retry mode by creating a retry draft populated from the process
  const startRetry = useCallback(
    async (executionProcessId: string, newPrompt: string) => {
      if (!attemptId) return;
      const proc = getProcessById(executionProcessId);
      if (!proc) return;
      const { disabled } = getRetryDisabledState(executionProcessId);
      if (disabled) return;

      let variant: string | null = null;
      try {
        const details =
          await executionProcessesApi.getDetails(executionProcessId);
        const typ: ExecutorActionType | undefined =
          details?.executor_action?.typ;
        if (
          typ &&
          (typ.type === 'CodingAgentInitialRequest' ||
            typ.type === 'CodingAgentFollowUpRequest')
        ) {
          variant = typ.executor_profile_id?.variant ?? null;
        }
      } catch {
        /* ignore */
      }

      setBusy(true);
      try {
        await attemptsApi.saveDraft(attemptId, 'retry', {
          retry_process_id: executionProcessId,
          prompt: newPrompt,
          variant,
          image_ids: [],
          version: null,
        });
      } finally {
        setBusy(false);
      }
    },
    [attemptId, getProcessById, getRetryDisabledState]
  );

  return {
    startRetry,
    getRetryDisabledState,
  };
}

export type UseProcessRetryReturn = ReturnType<typeof useProcessRetry>;
