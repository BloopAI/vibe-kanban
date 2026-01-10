import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type { Team, CreateTeam, UpdateTeam } from 'shared/types';
import { resolveTeamFromParam } from '@/lib/url-utils';
import { useWorkspaceOptional } from '@/contexts/WorkspaceContext';

// Query key factory for workspace-scoped teams
export const teamsKeys = {
  all: ['teams'] as const,
  list: (workspaceId?: string | null) => [...teamsKeys.all, 'list', workspaceId ?? 'all'] as const,
};

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

export interface UseTeamsResult {
  teams: Team[];
  teamsById: Record<string, Team>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createTeam: (data: CreateTeam) => Promise<Team>;
  updateTeam: (teamId: string, data: UpdateTeam) => Promise<Team>;
  deleteTeam: (teamId: string) => Promise<void>;
  resolveTeam: (param: string) => Team | undefined;
}

export function useTeams(): UseTeamsResult {
  const queryClient = useQueryClient();
  const workspaceContext = useWorkspaceOptional();
  const currentWorkspaceId = workspaceContext?.currentWorkspaceId ?? null;

  // Use workspace-scoped query key for proper cache isolation
  const queryKey = teamsKeys.list(currentWorkspaceId);

  const { data: teams = [], isLoading, error } = useQuery<Team[], Error>({
    queryKey,
    queryFn: () => teamsApi.list(currentWorkspaceId ?? undefined),
    staleTime: 5 * 60 * 1000, // 5 minutes - teams rarely change
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Never retry rate limit errors - this amplifies the problem
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });

  const teamsById = useMemo(() =>
    teams.reduce(
      (acc, team) => {
        acc[team.id] = team;
        return acc;
      },
      {} as Record<string, Team>
    ),
    [teams]
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTeam) => teamsApi.create(data),
    onSuccess: (newTeam) => {
      // Optimistically add the new team to the cache
      queryClient.setQueryData<Team[]>(queryKey, (old) =>
        old ? [...old, newTeam] : [newTeam]
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: UpdateTeam }) =>
      teamsApi.update(teamId, data),
    onSuccess: (updatedTeam) => {
      // Update the team in the cache
      queryClient.setQueryData<Team[]>(queryKey, (old) =>
        old?.map((t) => (t.id === updatedTeam.id ? updatedTeam : t)) ?? []
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(teamId),
    onSuccess: (_, teamId) => {
      // Remove the team from the cache
      queryClient.setQueryData<Team[]>(queryKey, (old) =>
        old?.filter((t) => t.id !== teamId) ?? []
      );
    },
  });

  const createTeam = useCallback(
    async (data: CreateTeam) => {
      return createMutation.mutateAsync(data);
    },
    [createMutation]
  );

  const updateTeam = useCallback(
    async (teamId: string, data: UpdateTeam) => {
      return updateMutation.mutateAsync({ teamId, data });
    },
    [updateMutation]
  );

  const deleteTeam = useCallback(
    async (teamId: string) => {
      await deleteMutation.mutateAsync(teamId);
    },
    [deleteMutation]
  );

  const resolveTeam = useMemo(
    () => (param: string) => resolveTeamFromParam(param, teams, teamsById),
    [teams, teamsById]
  );

  return {
    teams,
    teamsById,
    isLoading,
    error,
    refresh,
    createTeam,
    updateTeam,
    deleteTeam,
    resolveTeam,
  };
}
