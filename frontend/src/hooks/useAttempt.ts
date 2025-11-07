import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { TaskAttempt } from 'shared/types';

export const attemptKeys = {
  byId: (attemptId: string | undefined) => ['attempt', attemptId] as const,
};

type Options = {
  enabled?: boolean;
};

export function useAttempt(attemptId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<TaskAttempt>({
    queryKey: attemptKeys.byId(attemptId),
    queryFn: () => attemptsApi.get(attemptId!),
    enabled,
  });
}
