import { useQueries } from '@tanstack/react-query';
import { repoApi } from '@/lib/api';
import type { GitBranch, Repo } from 'shared/types';
import { repoBranchKeys } from './useRepoBranches';

export type RepositoryBranches = {
  repository_id: string;
  repository_name: string;
  branches: GitBranch[];
};

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

  const data: RepositoryBranches[] = repos.map((repo, i) => ({
    repository_id: repo.id,
    repository_name: repo.name,
    branches: queries[i]?.data ?? [],
  }));

  return { data, isLoading };
}
