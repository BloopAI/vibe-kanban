import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import type { WorkspaceWithStatus } from 'shared/types';

// UI-specific workspace type for sidebar display
export interface SidebarWorkspace {
  id: string;
  name: string;
  description: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isRunning?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
}

// Keep the old export name for backwards compatibility
export type Workspace = SidebarWorkspace;

export interface UseWorkspacesResult {
  workspaces: SidebarWorkspace[];
  archivedWorkspaces: SidebarWorkspace[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

// State shape from the WebSocket stream
type WorkspacesState = {
  workspaces: Record<string, WorkspaceWithStatus>;
};

// Simple hash function to generate consistent pseudo-random values from ID
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Transform WorkspaceWithStatus to SidebarWorkspace
function toSidebarWorkspace(ws: WorkspaceWithStatus): SidebarWorkspace {
  const hash = simpleHash(ws.id);

  return {
    id: ws.id,
    name: ws.name ?? ws.branch, // Use name if available, fallback to branch
    description: '',
    // Generate varied mock stats based on workspace id hash (not available from stream)
    filesChanged: (hash % 12) + 1, // 1-12 files
    linesAdded: (hash % 500) + 10, // 10-509 lines
    linesRemoved: hash % 200, // 0-199 lines
    // Real data from stream
    isRunning: ws.is_running,
    isPinned: ws.pinned,
    isArchived: ws.archived,
  };
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
};

export function useWorkspaces(): UseWorkspacesResult {
  const endpoint = '/api/task-attempts/stream/ws';

  const initialData = useCallback(
    (): WorkspacesState => ({ workspaces: {} }),
    []
  );

  const { data, isConnected, error } = useJsonPatchWsStream<WorkspacesState>(
    endpoint,
    true,
    initialData
  );

  const workspaces = useMemo(() => {
    if (!data?.workspaces) return [];
    return Object.values(data.workspaces)
      .filter((ws) => !ws.archived)
      .map(toSidebarWorkspace);
  }, [data]);

  const archivedWorkspaces = useMemo(() => {
    if (!data?.workspaces) return [];
    return Object.values(data.workspaces)
      .filter((ws) => ws.archived)
      .map(toSidebarWorkspace);
  }, [data]);

  // isLoading is true when we haven't received any data yet
  const isLoading = !data;

  return {
    workspaces,
    archivedWorkspaces,
    isLoading,
    isConnected,
    error,
  };
}
