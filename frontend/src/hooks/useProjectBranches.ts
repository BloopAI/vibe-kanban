import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';

export function useProjectBranches(projectId?: string) {
  return useQuery<GitBranch[]>({
    queryKey: ['projectBranches', projectId],
    queryFn: () => projectsApi.getBranches(projectId!),
    enabled: !!projectId,
  });
}
