import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';

export const branchKeys = {
  all: ['projectBranches'] as const,
  byProject: (projectId: string | undefined) =>
    ['projectBranches', projectId] as const,
};

type Options = {
  enabled?: boolean;
};

export function useBranches(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  return useQuery<GitBranch[]>({
    queryKey: branchKeys.byProject(projectId),
    queryFn: () => projectsApi.getBranches(projectId!),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
