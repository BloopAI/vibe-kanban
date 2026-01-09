import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { Repo } from 'shared/types';

type Options = {
  enabled?: boolean;
};

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

export function useProjectRepos(projectId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!projectId;

  return useQuery<Repo[]>({
    queryKey: ['projectRepositories', projectId],
    queryFn: () => projectsApi.getRepositories(projectId!),
    enabled,
    staleTime: 10 * 60 * 1000, // 10 minutes - repos rarely change
    gcTime: 30 * 60 * 1000, // 30 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      // Never retry rate limit errors
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000, // 60 seconds - respect rate limit window
  });
}
