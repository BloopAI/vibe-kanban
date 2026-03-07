import { useQuery } from '@tanstack/react-query';
import { workspacesApi, sessionsApi } from '@/shared/lib/api';
import type { Workspace } from 'shared/types';
import type { WorkspaceWithSession } from '@/shared/types/attempt';
import { createWorkspaceWithSession } from '@/shared/types/attempt';

export const taskWorkspaceKeys = {
  all: ['taskWorkspaces'] as const,
  byTask: (taskId: string | undefined) => ['taskWorkspaces', taskId] as const,
  byTaskWithSessions: (taskId: string | undefined) =>
    ['taskWorkspacesWithSessions', taskId] as const,
};

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useTaskWorkspaces(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;
  const refetchInterval = opts?.refetchInterval ?? 5000;

  return useQuery<Workspace[]>({
    queryKey: taskWorkspaceKeys.byTask(taskId),
    queryFn: () => workspacesApi.getAll(taskId!),
    enabled,
    refetchInterval,
  });
}

/**
 * Hook for components that need session data for all workspaces in a task.
 * Fetches all workspaces and their sessions in parallel.
 */
export function useTaskWorkspacesWithSessions(taskId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!taskId;
  const refetchInterval = opts?.refetchInterval ?? 5000;

  return useQuery<WorkspaceWithSession[]>({
    queryKey: taskWorkspaceKeys.byTaskWithSessions(taskId),
    queryFn: async () => {
      const workspaces = await workspacesApi.getAll(taskId!);
      // Fetch sessions for all workspaces in parallel
      const sessionsResults = await Promise.all(
        workspaces.map((workspace) => sessionsApi.getByWorkspace(workspace.id))
      );
      return workspaces.map((workspace, i) => {
        const session = sessionsResults[i][0];
        return createWorkspaceWithSession(workspace, session);
      });
    },
    enabled,
    refetchInterval,
  });
}
