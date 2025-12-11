import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { RepositoryBranches } from 'shared/types';

export function useProjectBranches(projectId?: string) {
  return useQuery<RepositoryBranches[]>({
    queryKey: ['projectBranches', projectId],
    queryFn: () => projectsApi.getBranches(projectId!),
    enabled: !!projectId,
  });
}
