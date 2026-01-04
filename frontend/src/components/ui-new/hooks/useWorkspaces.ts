import { useCallback, useMemo } from 'react';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import type { WorkspaceWithStatus } from 'shared/types';

// UI-specific workspace type for sidebar display
export interface SidebarWorkspace {
  id: string;
  taskId: string;
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
    taskId: ws.task_id,
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
  // Two separate WebSocket connections: one for active, one for archived
  const activeEndpoint = '/api/task-attempts/stream/ws?archived=false&limit=10';
  const archivedEndpoint =
    '/api/task-attempts/stream/ws?archived=true&limit=10';

  const initialData = useCallback(
    (): WorkspacesState => ({ workspaces: {} }),
    []
  );

  const {
    data: activeData,
    isConnected: activeIsConnected,
    isInitialized: activeIsInitialized,
    error: activeError,
  } = useJsonPatchWsStream<WorkspacesState>(activeEndpoint, true, initialData);

  const {
    data: archivedData,
    isConnected: archivedIsConnected,
    isInitialized: archivedIsInitialized,
    error: archivedError,
  } = useJsonPatchWsStream<WorkspacesState>(
    archivedEndpoint,
    true,
    initialData
  );

  const workspaces = useMemo(() => {
    if (!activeData?.workspaces) return [];
    return Object.values(activeData.workspaces)
      .sort((a, b) => {
        // First sort by pinned (pinned first)
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        // Then by created_at (newest first)
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      })
      .map(toSidebarWorkspace);
  }, [activeData]);

  const archivedWorkspaces = useMemo(() => {
    if (!archivedData?.workspaces) return [];
    return Object.values(archivedData.workspaces)
      .sort((a, b) => {
        // First sort by pinned (pinned first)
        if (a.pinned !== b.pinned) {
          return a.pinned ? -1 : 1;
        }
        // Then by created_at (newest first)
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      })
      .map(toSidebarWorkspace);
  }, [archivedData]);

  // isLoading is true when we haven't received initial data from either stream
  const isLoading = !activeIsInitialized || !archivedIsInitialized;

  // Combined connection status
  const isConnected = activeIsConnected && archivedIsConnected;

  // Combined error (show first error if any)
  const error = activeError || archivedError;

  return {
    workspaces,
    archivedWorkspaces,
    isLoading,
    isConnected,
    error,
  };
}
