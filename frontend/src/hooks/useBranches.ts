import { useQueries } from '@tanstack/react-query';
import { repoApi } from '@/lib/api';
import type { GitBranch, Repo } from 'shared/types';
import { repoBranchKeys } from './useRepoBranches';

type Options = {
  enabled?: boolean;
};

export function useBranches(repos: Repo[], opts?: Options) {
  const enabled = opts?.enabled ?? true;

  const queries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: repoBranchKeys.byRepo(repo.id),
      queryFn: () => repoApi.getBranches(repo.id),
      enabled,
      staleTime: 60_000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const data = new Map<string, GitBranch[]>(
    repos.map((repo, i) => [repo.id, queries[i]?.data ?? []])
  );

  return { data, isLoading };
}
