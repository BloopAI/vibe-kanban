import { useQuery } from '@tanstack/react-query';
import { teamsApi, projectsApi } from '../lib/api';
import type { Project } from 'shared/types';

export function useTeamProjects(teamId: string | undefined) {
  // Fetch full project data for this team directly from API
  // This ensures refresh button works properly
  const { data: projects = [], isLoading, error, refetch, isFetching } = useQuery<Project[]>({
    queryKey: ['teams', teamId, 'projects', 'full'],
    queryFn: async () => {
      if (!teamId) return [];
      // Get project IDs for this team
      const projectIds = await teamsApi.getProjects(teamId);
      if (projectIds.length === 0) return [];

      // Fetch all projects from API
      const fetched = await projectsApi.getMany(projectIds);

      // Sort by creation date descending
      return fetched.sort((a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
      );
    },
    enabled: Boolean(teamId),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });

  return {
    projects,
    projectIds: projects.map(p => p.id),
    isLoading,
    isFetching,
    refetch,
    error: error ? new Error(String(error)) : null,
  };
}
