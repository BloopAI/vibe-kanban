import type { Workspace } from 'shared/types';

/**
 * WorkspaceWithSession includes executor from the latest Session.
 * Only used by components that actually need the executor field.
 */
export type WorkspaceWithSession = Workspace & {
  executor: string;
};

/**
 * Create a WorkspaceWithSession from a Workspace and executor string.
 */
export function createWorkspaceWithSession(
  workspace: Workspace,
  executor: string
): WorkspaceWithSession {
  return {
    ...workspace,
    executor,
  };
}
