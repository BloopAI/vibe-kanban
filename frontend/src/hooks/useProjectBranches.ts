import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { projectsApi } from '@/lib/api';
import type { ProjectBranchesResponse } from 'shared/types';

export function useProjectBranches(projectId?: string) {
  const query = useQuery<ProjectBranchesResponse>({
    queryKey: ['projectBranches', projectId],
    queryFn: () => projectsApi.getBranchesByRepo(projectId!),
    enabled: !!projectId,
  });

  const branches = useMemo(
    () => query.data?.repositories.flatMap((r) => r.branches) ?? [],
    [query.data]
  );

  return {
    ...query,
    data: branches,
    repositories: query.data?.repositories ?? [],
  };
}
