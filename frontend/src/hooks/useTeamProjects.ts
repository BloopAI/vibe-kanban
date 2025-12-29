import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { teamsApi } from '../lib/api';
import { useProjects } from './useProjects';
import type { Project } from 'shared/types';

export function useTeamProjects(teamId: string | undefined) {
  const { projectsById, isLoading: projectsLoading } = useProjects();

  const { data: projectIds, isLoading: idsLoading, error } = useQuery<string[]>({
    queryKey: ['teams', teamId, 'projects'],
    queryFn: async () => {
      if (!teamId) return [];
      return teamsApi.getProjects(teamId);
    },
    enabled: Boolean(teamId),
  });

  const projects = useMemo(() => {
    if (!projectIds) return [];
    return projectIds
      .map(id => projectsById[id])
      .filter((p): p is Project => p !== undefined)
      .sort((a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
      );
  }, [projectIds, projectsById]);

  return {
    projects,
    projectIds: projectIds ?? [],
    isLoading: idsLoading || projectsLoading,
    error: error ? new Error(String(error)) : null,
  };
}
