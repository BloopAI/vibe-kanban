import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { sessionsApi } from '@/lib/api';
import type { Session } from 'shared/types';

interface UseWorkspaceSessionsOptions {
  enabled?: boolean;
}

interface UseWorkspaceSessionsResult {
  sessions: Session[];
  selectedSession: Session | undefined;
  selectedSessionId: string | undefined;
  selectSession: (sessionId: string) => void;
  selectLatestSession: () => void;
  isLoading: boolean;
}

/**
 * Hook for managing sessions within a workspace.
 * Fetches all sessions for a workspace and provides session switching capability.
 * Sessions are ordered by created_at DESC (latest first).
 */
export function useWorkspaceSessions(
  workspaceId: string | undefined,
  options: UseWorkspaceSessionsOptions = {}
): UseWorkspaceSessionsResult {
  const { enabled = true } = options;
  const [selectedSessionId, setSelectedSessionId] = useState<
    string | undefined
  >(undefined);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['workspaceSessions', workspaceId],
    queryFn: () => sessionsApi.getByWorkspace(workspaceId!),
    enabled: enabled && !!workspaceId,
  });

  // Combined effect: handle workspace changes and auto-select sessions
  // This replaces two separate effects that had a race condition where the reset
  // effect would fire after auto-select when sessions were cached, undoing the selection.
  useEffect(() => {
    if (sessions.length > 0) {
      // Sessions are ordered by created_at DESC, so first is latest
      // Always select first session when sessions are available for this workspace
      setSelectedSessionId(sessions[0].id);
    } else {
      // No sessions - reset selection (handles workspace change before fetch completes)
      setSelectedSessionId(undefined);
    }
  }, [workspaceId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId]
  );

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  const selectLatestSession = useCallback(() => {
    if (sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions]);

  return {
    sessions,
    selectedSession,
    selectedSessionId,
    selectSession,
    selectLatestSession,
    isLoading,
  };
}
