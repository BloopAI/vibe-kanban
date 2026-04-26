import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import { useJsonPatchWsStream } from '@/shared/hooks/useJsonPatchWsStream';
import { workspaceSummaryKeys } from '@/shared/hooks/workspaceSummaryKeys';
import { makeLocalApiRequest } from '@/shared/lib/localApiTransport';
import { useHostId } from '@/shared/providers/HostIdProvider';
import type {
  WorkspaceWithStatus,
  WorkspaceSummary,
  WorkspaceSummaryResponse,
  ApiResponse,
} from 'shared/types';

// UI-specific workspace type for sidebar display
export interface SidebarWorkspace {
  id: string;
  name: string;
  branch: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  isRunning?: boolean;
  isPinned?: boolean;
  isArchived?: boolean;
  hasPendingApproval?: boolean;
  hasRunningDevServer?: boolean;
  hasUnseenActivity?: boolean;
  latestProcessCompletedAt?: string;
  latestProcessStatus?: 'running' | 'completed' | 'failed' | 'killed';
  prStatus?: 'open' | 'merged' | 'closed' | 'unknown';
  prNumber?: number;
  prUrl?: string;
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
  const latestProcessStatus = summary?.latest_process_status ?? undefined;
  const isSettled =
    latestProcessStatus === 'completed' ||
    latestProcessStatus === 'failed' ||
    latestProcessStatus === 'killed';
  const isRunning =
    latestProcessStatus === 'running'
      ? true
      : isSettled
        ? false
        : ws.is_running;

  return {
    id: ws.id,
    name: ws.name ?? ws.branch, // Use name if available, fallback to branch
    branch: ws.branch,
    createdAt: ws.created_at,
    updatedAt: ws.updated_at,
    description: '',
    // Use real stats from summary if available
    filesChanged: summary?.files_changed ?? undefined,
    linesAdded: summary?.lines_added ?? undefined,
    linesRemoved: summary?.lines_removed ?? undefined,
    // Real data from stream
    isRunning,
    isPinned: ws.pinned,
    isArchived: ws.archived,
    // Additional data from summary
    hasPendingApproval: summary?.has_pending_approval,
    hasRunningDevServer: summary?.has_running_dev_server,
    hasUnseenActivity: summary?.has_unseen_turns,
    latestProcessCompletedAt: summary?.latest_process_completed_at ?? undefined,
    latestProcessStatus,
    prStatus: summary?.pr_status ?? undefined,
    prNumber:
      summary?.pr_number != null ? Number(summary.pr_number) : undefined,
    prUrl: summary?.pr_url ?? undefined,
  };
}

export const workspaceKeys = {
  all: ['workspaces'] as const,
};

// workspaceSummaryKeys is imported from @/shared/hooks/workspaceSummaryKeys

// Fetch workspace summaries from the API by archived status
async function fetchWorkspaceSummariesByArchived(
  archived: boolean,
  hostId: string | null
): Promise<Map<string, WorkspaceSummary>> {
  try {
    const basePath = hostId ? `/api/host/${hostId}` : '/api';
    const response = await makeLocalApiRequest(
      `${basePath}/workspaces/summaries`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived }),
      }
    );

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
  const hostId = useHostId();
  const queryClient = useQueryClient();

  // Two separate WebSocket connections: one for active, one for archived
  // No limit param - we fetch all and slice on frontend so backfill works when archiving
  const apiBasePath = hostId ? `/api/host/${hostId}` : '/api';
  const activeEndpoint = `${apiBasePath}/workspaces/streams/ws?archived=false`;
  const archivedEndpoint = `${apiBasePath}/workspaces/streams/ws?archived=true`;

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
    isInitialized: archivedIsInitialized,
    error: archivedError,
  } = useJsonPatchWsStream<WorkspacesState>(
    archivedEndpoint,
    true,
    initialData
  );

  // Wait for both streams to be initialized before fetching summaries
  // Fetch summaries for active workspaces
  const { data: activeSummaries = new Map<string, WorkspaceSummary>() } =
    useQuery({
      queryKey: workspaceSummaryKeys.byArchived(false, hostId),
      queryFn: () => fetchWorkspaceSummariesByArchived(false, hostId),
      enabled: activeIsInitialized,
      staleTime: 60000,
      refetchInterval: 10000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      placeholderData: keepPreviousData,
    });

  // Fetch summaries for archived workspaces
  const { data: archivedSummaries = new Map<string, WorkspaceSummary>() } =
    useQuery({
      queryKey: workspaceSummaryKeys.byArchived(true, hostId),
      queryFn: () => fetchWorkspaceSummariesByArchived(true, hostId),
      enabled: archivedIsInitialized,
      staleTime: 60000,
      refetchInterval: 10000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      placeholderData: keepPreviousData,
    });

  const activeRefreshTimeoutRef = useRef<number | null>(null);
  const archivedRefreshTimeoutRef = useRef<number | null>(null);
  const didSeeActiveSnapshotRef = useRef(false);
  const didSeeArchivedSnapshotRef = useRef(false);

  useEffect(() => {
    if (!activeIsInitialized || !activeData) {
      return;
    }

    if (!didSeeActiveSnapshotRef.current) {
      didSeeActiveSnapshotRef.current = true;
      return;
    }

    if (activeRefreshTimeoutRef.current !== null) {
      window.clearTimeout(activeRefreshTimeoutRef.current);
    }

    activeRefreshTimeoutRef.current = window.setTimeout(() => {
      activeRefreshTimeoutRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryKeys.byArchived(false, hostId),
      });
    }, 250);

    return () => {
      if (activeRefreshTimeoutRef.current !== null) {
        window.clearTimeout(activeRefreshTimeoutRef.current);
        activeRefreshTimeoutRef.current = null;
      }
    };
  }, [activeData, activeIsInitialized, hostId, queryClient]);

  useEffect(() => {
    if (!archivedIsInitialized || !archivedData) {
      return;
    }

    if (!didSeeArchivedSnapshotRef.current) {
      didSeeArchivedSnapshotRef.current = true;
      return;
    }

    if (archivedRefreshTimeoutRef.current !== null) {
      window.clearTimeout(archivedRefreshTimeoutRef.current);
    }

    archivedRefreshTimeoutRef.current = window.setTimeout(() => {
      archivedRefreshTimeoutRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: workspaceSummaryKeys.byArchived(true, hostId),
      });
    }, 250);

    return () => {
      if (archivedRefreshTimeoutRef.current !== null) {
        window.clearTimeout(archivedRefreshTimeoutRef.current);
        archivedRefreshTimeoutRef.current = null;
      }
    };
  }, [archivedData, archivedIsInitialized, hostId, queryClient]);

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
      .map((ws) => toSidebarWorkspace(ws, activeSummaries.get(ws.id)));
  }, [activeData, activeSummaries]);

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
      .map((ws) => toSidebarWorkspace(ws, archivedSummaries.get(ws.id)));
  }, [archivedData, archivedSummaries]);

  // The primary workspace list must not be blocked by archived workspace
  // initialization. Archived snapshots can be slow under load and are not
  // required to render active workspaces.
  const isLoading = !activeIsInitialized;

  // Keep active workspace connectivity independent from the optional archived
  // stream so a slow archive query does not blank the main workspace list.
  const isConnected = activeIsConnected;

  // Only surface archived stream errors after the active list has initialized.
  const error = activeError || (activeIsInitialized ? archivedError : null);

  return {
    workspaces,
    archivedWorkspaces,
    isLoading,
    isConnected,
    error,
  };
}
