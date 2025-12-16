import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Repo } from 'shared/types';

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
