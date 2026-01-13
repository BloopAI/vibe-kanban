import { useCallback } from 'react';
import { useJsonPatchWsStream } from './useJsonPatchWsStream';
import type { ExecutionProcess } from 'shared/types';

type DevServerState = {
  execution_processes: Record<string, ExecutionProcess>;
};

interface UseWorkspaceDevServersResult {
  devServers: ExecutionProcess[];
  devServersById: Record<string, ExecutionProcess>;
  runningDevServers: ExecutionProcess[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

/**
 * Stream dev server processes for a workspace (across all sessions) via WebSocket (JSON Patch).
 * This enables dev servers to remain visible when switching between sessions within a workspace.
 * Server sends initial snapshot: replace /execution_processes with an object keyed by id.
 * Live updates arrive at /execution_processes/<id> via add/replace/remove operations.
 */
export function useWorkspaceDevServers(
  workspaceId: string | undefined
): UseWorkspaceDevServersResult {
  let endpoint: string | undefined;

  if (workspaceId) {
    endpoint = `/api/execution-processes/stream/workspace-dev-servers/ws?workspace_id=${workspaceId}`;
  }

  const initialData = useCallback(
    (): DevServerState => ({ execution_processes: {} }),
    []
  );

  const { data, isConnected, isInitialized, error } =
    useJsonPatchWsStream<DevServerState>(endpoint, !!workspaceId, initialData);

  const devServersById = data?.execution_processes ?? {};
  const devServers = Object.values(devServersById).sort(
    (a, b) =>
      new Date(b.created_at as unknown as string).getTime() -
      new Date(a.created_at as unknown as string).getTime()
  );

  const runningDevServers = devServers.filter(
    (process) => process.status === 'running'
  );

  const isLoading = !!workspaceId && !isInitialized && !error;

  return {
    devServers,
    devServersById,
    runningDevServers,
    isLoading,
    isConnected,
    error,
  };
}
