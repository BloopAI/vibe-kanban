import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Project } from 'shared/types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => projectsApi.getAll(),
    staleTime: 30000, // Consider data fresh for 30 seconds
  });
}
