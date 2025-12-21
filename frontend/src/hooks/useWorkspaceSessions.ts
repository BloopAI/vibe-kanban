import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { sessionsApi } from '@/lib/api';
import type { Session } from 'shared/types';

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
  workspaceId: string | undefined
): UseWorkspaceSessionsResult {
  const [selectedSessionId, setSelectedSessionId] = useState<
    string | undefined
  >(undefined);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ['workspaceSessions', workspaceId],
    queryFn: () => sessionsApi.getByWorkspace(workspaceId!),
    enabled: !!workspaceId,
  });

  // Auto-select the latest session when sessions load or workspace changes
  useEffect(() => {
    if (sessions.length > 0 && !selectedSessionId) {
      // Sessions are ordered by created_at DESC, so first is latest
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Reset selection when workspace changes
  useEffect(() => {
    setSelectedSessionId(undefined);
  }, [workspaceId]);

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
