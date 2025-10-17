import { useMemo } from 'react';
import type {
  BaseCodingAgent,
  ExecutorAction,
  ExecutionProcess,
} from 'shared/types';
import { useExecutionProcesses } from './useExecutionProcesses';

/**
 * Monitors execution processes for a given attempt, checks whether the most recently created process failed with "agent_not_installed",
 * and returns the coding agent ID.
 */
export function useAgentNeedsInstallation(
  attemptId: string
): BaseCodingAgent | null {
  const { executionProcesses } = useExecutionProcesses(attemptId);

  const latestProcessNeedingInstall = useMemo<ExecutionProcess | null>(() => {
    if (!executionProcesses?.length) return null;

    const latestCodingAgent = executionProcesses
      .filter(
        (process) => process.run_reason === 'codingagent' && !process.dropped
      )
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.created_at).getTime();
        const bTime = new Date(b.created_at).getTime();
        return bTime - aTime;
      })[0];

    if (!latestCodingAgent?.agent_not_installed) {
      return null;
    }

    return latestCodingAgent;
  }, [executionProcesses]);

  if (!latestProcessNeedingInstall) {
    return null;
  }

  return extractCodingAgent(latestProcessNeedingInstall.executor_action);
}

/** Simple helper to get the coding agent associated with an executor action. */
function extractCodingAgent(
  action: ExecutorAction | null
): BaseCodingAgent | null {
  if (!action) return null;

  const { typ, next_action } = action;

  if (typ.type === 'CodingAgentInitialRequest') {
    return typ.executor_profile_id.executor;
  }

  if (typ.type === 'CodingAgentFollowUpRequest') {
    return typ.executor_profile_id.executor;
  }

  return extractCodingAgent(next_action);
}
