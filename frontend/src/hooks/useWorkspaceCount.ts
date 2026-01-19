import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export const workspaceCountKeys = {
  count: ['workspaceCount'] as const,
};

type Options = {
  enabled?: boolean;
};

export function useWorkspaceCount(opts?: Options) {
  const enabled = opts?.enabled ?? true;

  return useQuery<number>({
    queryKey: workspaceCountKeys.count,
    queryFn: () => attemptsApi.getCount(),
    enabled,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
