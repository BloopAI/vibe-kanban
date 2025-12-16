import type { Workspace } from 'shared/types';

/**
 * TaskAttempt combines Workspace with executor from the latest Session.
 * This is constructed on the frontend from Workspace + Session data.
 */
export type TaskAttempt = Workspace & {
  executor: string;
};

/**
 * Create a TaskAttempt from a Workspace and executor string.
 */
export function createTaskAttempt(
  workspace: Workspace,
  executor: string
): TaskAttempt {
  return {
    ...workspace,
    executor,
  };
}
