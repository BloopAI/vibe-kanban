import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '@/lib/api';
import type { Team, CreateTeam, UpdateTeam } from 'shared/types';
import { resolveTeamFromParam } from '@/lib/url-utils';

const TEAMS_QUERY_KEY = ['teams'];

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

  const { data: teams = [], isLoading, error } = useQuery<Team[], Error>({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: () => teamsApi.list(),
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
    await queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: (data: CreateTeam) => teamsApi.create(data),
    onSuccess: (newTeam) => {
      // Optimistically add the new team to the cache
      queryClient.setQueryData<Team[]>(TEAMS_QUERY_KEY, (old) =>
        old ? [...old, newTeam] : [newTeam]
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: UpdateTeam }) =>
      teamsApi.update(teamId, data),
    onSuccess: (updatedTeam) => {
      // Update the team in the cache
      queryClient.setQueryData<Team[]>(TEAMS_QUERY_KEY, (old) =>
        old?.map((t) => (t.id === updatedTeam.id ? updatedTeam : t)) ?? []
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (teamId: string) => teamsApi.delete(teamId),
    onSuccess: (_, teamId) => {
      // Remove the team from the cache
      queryClient.setQueryData<Team[]>(TEAMS_QUERY_KEY, (old) =>
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
