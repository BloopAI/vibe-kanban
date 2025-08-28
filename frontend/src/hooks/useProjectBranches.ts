import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';

export function useProjectBranches(projectId?: string) {
  return useQuery({
    queryKey: ['projectBranches', projectId],
    queryFn: () => projectsApi.getBranches(projectId!),
    enabled: !!projectId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
