import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';

export const projectKeys = {
  all: ['projects'] as const,
  byId: (projectId: string | undefined) => ['project', projectId] as const,
  repositories: (projectId: string | undefined) =>
    ['projectRepositories', projectId] as const,
};

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: projectKeys.all,
    queryFn: () => projectsApi.getAll(),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
