import type {
  ExecutionProcessRunReason,
  ExecutionProcessStatus,
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
