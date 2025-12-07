import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { PrCommentsResponse } from 'shared/types';

export const prCommentsKeys = {
  all: ['prComments'] as const,
  byAttempt: (attemptId: string | undefined) =>
    ['prComments', attemptId] as const,
};

type Options = {
  enabled?: boolean;
};

export function usePrComments(attemptId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<PrCommentsResponse>({
    queryKey: prCommentsKeys.byAttempt(attemptId),
    queryFn: () => attemptsApi.getPrComments(attemptId!),
    enabled,
    staleTime: 30_000, // Cache for 30s - comments don't change frequently
    retry: 2,
  });
}
