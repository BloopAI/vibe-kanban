import type {
  ExecutionProcessRunReason,
  ExecutionProcessStatus,
  ExecutionProcess,
} from 'shared/types';

// Process run reasons
export const PROCESS_RUN_REASONS = {
  SETUP_SCRIPT: 'setupscript' as ExecutionProcessRunReason,
  CLEANUP_SCRIPT: 'cleanupscript' as ExecutionProcessRunReason,
  CODING_AGENT: 'codingagent' as ExecutionProcessRunReason,
  DEV_SERVER: 'devserver' as ExecutionProcessRunReason,
} as const;

// Process statuses
export const PROCESS_STATUSES = {
  RUNNING: 'running' as ExecutionProcessStatus,
  COMPLETED: 'completed' as ExecutionProcessStatus,
  FAILED: 'failed' as ExecutionProcessStatus,
  KILLED: 'killed' as ExecutionProcessStatus,
} as const;

// Helper functions
export const isAutoCollapsibleProcess = (
  runReason: ExecutionProcessRunReason
): boolean => {
  return (
    runReason === PROCESS_RUN_REASONS.SETUP_SCRIPT ||
    runReason === PROCESS_RUN_REASONS.CLEANUP_SCRIPT
  );
};

export const isCodingAgent = (
  runReason: ExecutionProcessRunReason
): boolean => {
  return runReason === PROCESS_RUN_REASONS.CODING_AGENT;
};

export const isProcessCompleted = (status: ExecutionProcessStatus): boolean => {
  return (
    status === PROCESS_STATUSES.COMPLETED || status === PROCESS_STATUSES.FAILED
  );
};

export const shouldShowInLogs = (
  runReason: ExecutionProcessRunReason
): boolean => {
  return runReason !== PROCESS_RUN_REASONS.DEV_SERVER;
};

export const getLatestCodingAgent = (
  processes: ExecutionProcess[]
): string | null => {
  const codingAgents = processes.filter((p) => isCodingAgent(p.run_reason));
  if (codingAgents.length === 0) return null;

  return codingAgents.sort((a, b) =>
    a.started_at === b.started_at
      ? a.id.localeCompare(b.id) // tie-break for same timestamp
      : new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  )[0].id;
};
