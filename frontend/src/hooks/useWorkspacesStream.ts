import { useMemo } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { WorkspaceWithStatus } from 'shared/types';

interface WorkspacesState {
  workspaces: Record<string, WorkspaceWithStatus>;
}

const initialState = (): WorkspacesState => ({ workspaces: {} });

export function useWorkspacesStream() {
  const endpoint = `/api/task-attempts/stream/ws`;
  const { data, isConnected, error } = useJsonPatchWsStream<WorkspacesState>(
    endpoint,
    true,
    initialState
  );

  const workspaces = useMemo(
    () => Object.values(data?.workspaces ?? {}),
    [data?.workspaces]
  );

  return { workspaces, isConnected, error };
}
