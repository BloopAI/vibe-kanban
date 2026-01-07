import { useCallback, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useJsonPatchWsStream } from '@/hooks/useJsonPatchWsStream';
import type {
  WorkspaceWithStatus,
  WorkspaceSummary,
  WorkspaceSummaryResponse,
  ApiResponse,
} from 'shared/types';

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
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  latestProcessCompletedAt?: string;
  latestProcessStatus?: 'running' | 'completed' | 'failed' | 'killed';
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

// Transform WorkspaceWithStatus to SidebarWorkspace, optionally merging summary data
function toSidebarWorkspace(
  ws: WorkspaceWithStatus,
  summary?: WorkspaceSummary
): SidebarWorkspace {
  return {
    id: ws.id,
    taskId: ws.task_id,
    name: ws.name ?? ws.branch, // Use name if available, fallback to branch
    description: '',
    // Use real stats from summary if available
    filesChanged: summary?.files_changed ?? undefined,
    linesAdded: summary?.lines_added ?? undefined,
    linesRemoved: summary?.lines_removed ?? undefined,
    // Real data from stream
    isRunning: ws.is_running,
    isPinned: ws.pinned,
    isArchived: ws.archived,
    // Additional data from summary
    hasPendingApproval: summary?.has_pending_approval,
    hasRunningDevServer: summary?.has_running_dev_server,
    latestProcessCompletedAt: summary?.latest_process_completed_at ?? undefined,
    latestProcessStatus: summary?.latest_process_status ?? undefined,
  };
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
};

// Query key factory for workspace summaries
export const workspaceSummaryKeys = {
  all: ['workspace-summaries'] as const,
  byIds: (ids: string[]) =>
    ['workspace-summaries', ids.sort().join(',')] as const,
};

// Fetch workspace summaries from the API
async function fetchWorkspaceSummaries(
  workspaceIds: string[]
): Promise<Map<string, WorkspaceSummary>> {
  if (workspaceIds.length === 0) {
    return new Map();
  }

  try {
    const response = await fetch('/api/task-attempts/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_ids: workspaceIds }),
    });

    if (!response.ok) {
      console.warn('Failed to fetch workspace summaries:', response.status);
      return new Map();
    }

    const data: ApiResponse<WorkspaceSummaryResponse> = await response.json();
    if (!data.success || !data.data?.summaries) {
      return new Map();
    }

    const map = new Map<string, WorkspaceSummary>();
    for (const summary of data.data.summaries) {
      map.set(summary.workspace_id, summary);
    }
    return map;
  } catch (err) {
    console.warn('Error fetching workspace summaries:', err);
    return new Map();
  }
}

export function useWorkspaces(): UseWorkspacesResult {
  // Two separate WebSocket connections: one for active, one for archived
  // No limit param - we fetch all and slice on frontend so backfill works when archiving
  const activeEndpoint = '/api/task-attempts/stream/ws?archived=false';
  const archivedEndpoint = '/api/task-attempts/stream/ws?archived=true';

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

  // Wait for both streams to be initialized before fetching summaries
  // This prevents race conditions where the query key changes mid-fetch
  const bothStreamsReady = activeIsInitialized && archivedIsInitialized;

  // Collect all workspace IDs from both active and archived
  const allWorkspaceIds = useMemo(() => {
    const ids: string[] = [];
    if (activeData?.workspaces) {
      ids.push(...Object.keys(activeData.workspaces));
    }
    if (archivedData?.workspaces) {
      ids.push(...Object.keys(archivedData.workspaces));
    }
    return ids;
  }, [activeData, archivedData]);

  // Fetch summaries using TanStack Query with 30s auto-refresh
  const { data: summaries = new Map<string, WorkspaceSummary>() } = useQuery({
    queryKey: workspaceSummaryKeys.byIds(allWorkspaceIds),
    queryFn: () => fetchWorkspaceSummaries(allWorkspaceIds),
    enabled: bothStreamsReady && allWorkspaceIds.length > 0,
    staleTime: 1000, // Consider data stale after 1s (prevents duplicate fetches)
    refetchInterval: 15000, // Auto-refresh every 15s
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // Ensure fetch runs when IDs become available
    // Preserve previous summaries when query key changes (workspace added/deleted)
    // This prevents summary info from disappearing during refetch
    placeholderData: keepPreviousData,
  });

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
      .map((ws) => toSidebarWorkspace(ws, summaries.get(ws.id)));
  }, [activeData, summaries]);

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
      .map((ws) => toSidebarWorkspace(ws, summaries.get(ws.id)));
  }, [archivedData, summaries]);

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
