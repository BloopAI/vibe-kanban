import type {
  BaseCodingAgent,
  ExecutorConfigs,
  ExecutorAction,
  ExecutorProfileId,
  ExecutionProcess,
} from 'shared/types';

/**
 * Get variant options for a given executor from profiles.
 */
export function getVariantOptions(
  executor: BaseCodingAgent | null | undefined,
  profiles: ExecutorConfigs['executors'] | null | undefined
): string[] {
  if (!executor || !profiles) return [];
  const executorConfig = profiles[executor];
  return executorConfig ? Object.keys(executorConfig) : [];
}

/**
 * Extract ExecutorProfileId from an ExecutorAction chain.
 * Traverses the action chain to find the first coding agent request.
 */
export function extractProfileFromAction(
  action: ExecutorAction | null
): ExecutorProfileId | null {
  let curr: ExecutorAction | null = action;
  while (curr) {
    const typ = curr.typ;
    switch (typ.type) {
      case 'CodingAgentInitialRequest':
      case 'CodingAgentFollowUpRequest':
        return typ.executor_profile_id;
      case 'ScriptRequest':
        curr = curr.next_action;
        continue;
    }
  }
  return null;
}

/**
 * Get the latest ExecutorProfileId from a list of execution processes.
 * Searches from most recent to oldest.
 */
export function getLatestProfileFromProcesses(
  processes: ExecutionProcess[] | undefined
): ExecutorProfileId | null {
  if (!processes?.length) return null;
  return (
    processes
      .slice()
      .reverse()
      .map((p) => extractProfileFromAction(p.executor_action ?? null))
      .find((pid) => pid !== null) ?? null
  );
}
