import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { GitRemote } from 'shared/types';

type Options = {
  enabled?: boolean;
};

export function useProjectRemotes(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  return useQuery<GitRemote[]>({
    queryKey: ['projectRemotes', projectId],
    queryFn: () => projectsApi.getRemotes(projectId!),
    enabled,
    staleTime: 60_000,
  });
}
