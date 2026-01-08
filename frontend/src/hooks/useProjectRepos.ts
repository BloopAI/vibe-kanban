import { useQuery, useQueries } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Repo } from 'shared/types';
import type { RepoWithDefaultBranch } from './useRepoBranchSelection';

type Options = {
  enabled?: boolean;
};

export function useProjectRepos(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  return useQuery<Repo[]>({
    queryKey: ['projectRepositories', projectId],
    queryFn: () => projectsApi.getRepositories(projectId!),
    enabled,
  });
}

/**
 * Fetch project repositories with their configured default branches.
 * This merges data from both the repos and project_repos tables.
 */
export function useProjectReposWithDefaults(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  const queries = useQueries({
    queries: [
      {
        queryKey: ['projectRepositories', projectId],
        queryFn: () => projectsApi.getRepositories(projectId!),
        enabled,
      },
      {
        queryKey: ['projectRepositoryConfigs', projectId],
        queryFn: () => projectsApi.getRepositoryConfigs(projectId!),
        enabled,
      },
    ],
  });

  const [reposQuery, configsQuery] = queries;
  const isLoading = reposQuery.isLoading || configsQuery.isLoading;

  // Merge repos with their configured default branches
  const data: RepoWithDefaultBranch[] | undefined =
    reposQuery.data && configsQuery.data
      ? reposQuery.data.map((repo) => {
          const config = configsQuery.data?.find((c) => c.repo_id === repo.id);
          return {
            ...repo,
            configuredDefaultBranch: config?.default_branch ?? null,
          };
        })
      : undefined;

  return {
    data,
    isLoading,
    isError: reposQuery.isError || configsQuery.isError,
    error: reposQuery.error ?? configsQuery.error,
  };
}
