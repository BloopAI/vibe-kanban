import { useState, useEffect, useCallback } from 'react';
import { teamsApi } from '@/lib/api';
import type { Team, CreateTeam, UpdateTeam } from 'shared/types';

export interface UseTeamsResult {
  teams: Team[];
  teamsById: Record<string, Team>;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createTeam: (data: CreateTeam) => Promise<Team>;
  updateTeam: (teamId: string, data: UpdateTeam) => Promise<Team>;
  deleteTeam: (teamId: string) => Promise<void>;
}

export function useTeams(): UseTeamsResult {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await teamsApi.list();
      setTeams(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch teams'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const teamsById = teams.reduce(
    (acc, team) => {
      acc[team.id] = team;
      return acc;
    },
    {} as Record<string, Team>
  );

  const createTeam = useCallback(
    async (data: CreateTeam) => {
      const newTeam = await teamsApi.create(data);
      setTeams((prev) => [...prev, newTeam]);
      return newTeam;
    },
    []
  );

  const updateTeam = useCallback(
    async (teamId: string, data: UpdateTeam) => {
      const updatedTeam = await teamsApi.update(teamId, data);
      setTeams((prev) =>
        prev.map((t) => (t.id === teamId ? updatedTeam : t))
      );
      return updatedTeam;
    },
    []
  );

  const deleteTeam = useCallback(async (teamId: string) => {
    await teamsApi.delete(teamId);
    setTeams((prev) => prev.filter((t) => t.id !== teamId));
  }, []);

  return {
    teams,
    teamsById,
    isLoading,
    error,
    refresh,
    createTeam,
    updateTeam,
    deleteTeam,
  };
}
