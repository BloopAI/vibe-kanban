import { useQuery } from '@tanstack/react-query';
import { teamsApi, projectsApi } from '../lib/api';
import { useProjects } from './useProjects';
import type { Project } from 'shared/types';

export function useTeamProjects(teamId: string | undefined) {
  const { projectsById, addProject } = useProjects();

  // Fetch full project data for this team directly from API
  // This ensures refresh button works properly
  const { data: projects = [], isLoading, error, refetch, isFetching } = useQuery<Project[]>({
    queryKey: ['teams', teamId, 'projects', 'full'],
    queryFn: async () => {
      if (!teamId) return [];
      // Get project IDs for this team
      const projectIds = await teamsApi.getProjects(teamId);
      if (projectIds.length === 0) return [];

      // For each ID, try to get from WebSocket cache first, otherwise fetch from API
      const projects: Project[] = [];
      const missingIds: string[] = [];

      for (const id of projectIds) {
        if (projectsById[id]) {
          projects.push(projectsById[id]);
        } else {
          missingIds.push(id);
        }
      }

      // Fetch missing projects from API
      if (missingIds.length > 0) {
        const fetched = await projectsApi.getMany(missingIds);
        // Add fetched projects to optimistic cache so they're available everywhere
        fetched.forEach(p => addProject(p));
        projects.push(...fetched);
      }

      // Sort by creation date descending
      return projects.sort((a, b) =>
        new Date(b.created_at as unknown as string).getTime() -
        new Date(a.created_at as unknown as string).getTime()
      );
    },
    enabled: Boolean(teamId),
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
