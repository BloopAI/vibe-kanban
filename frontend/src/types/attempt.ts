import type { Workspace, SessionWithInitiator } from 'shared/types';

/**
 * WorkspaceWithSession includes the latest Session for the workspace.
 * Provides access to session.id, session.executor, session.initiated_by, etc.
 */
export type WorkspaceWithSession = Workspace & {
  session: SessionWithInitiator | undefined;
};

/**
 * Create a WorkspaceWithSession from a Workspace and Session.
 */
export function createWorkspaceWithSession(
  workspace: Workspace,
  session: SessionWithInitiator | undefined
): WorkspaceWithSession {
  return {
    ...workspace,
    session,
  };
}
