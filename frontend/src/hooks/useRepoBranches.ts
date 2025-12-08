import { useQuery } from '@tanstack/react-query';
import { repoApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';

export const repoBranchKeys = {
  all: ['repoBranches'] as const,
  byPath: (path: string) => ['repoBranches', path] as const,
};

type Options = {
  enabled?: boolean;
};

export function useRepoBranches(repoPath: string | undefined, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!repoPath;

  return useQuery<GitBranch[]>({
    queryKey: repoBranchKeys.byPath(repoPath ?? ''),
    queryFn: () => repoApi.getBranches(repoPath!),
    enabled,
    staleTime: 60_000,
  });
}
