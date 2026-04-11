import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { PrCommentsResponse } from 'shared/types';

export const prCommentsKeys = {
  all: ['prComments'] as const,
  byAttempt: (workspaceId: string | undefined, repoId: string | undefined) =>
    ['prComments', workspaceId, repoId] as const,
};

type Options = {
  enabled?: boolean;
};

export function usePrComments(
  workspaceId?: string,
  repoId?: string,
  opts?: Options
) {
  const enabled = (opts?.enabled ?? true) && !!workspaceId && !!repoId;

  return useQuery<PrCommentsResponse>({
    queryKey: prCommentsKeys.byAttempt(workspaceId, repoId),
    queryFn: () => workspacesApi.getPrComments(workspaceId!, repoId!),
    enabled,
    staleTime: 30_000, // Cache for 30s - comments don't change frequently
    retry: 2,
  });
}
