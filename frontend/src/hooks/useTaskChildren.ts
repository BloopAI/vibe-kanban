import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { Task } from 'shared/types';

export const taskChildrenKeys = {
  all: ['taskChildren'] as const,
  byAttempt: (attemptId: string | undefined) =>
    ['taskChildren', attemptId] as const,
};

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
  staleTime?: number;
  retry?: number | false;
};

export function useTaskChildren(attemptId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<Task[]>({
    queryKey: taskChildrenKeys.byAttempt(attemptId),
    queryFn: async () => {
      const data = await attemptsApi.getChildren(attemptId!);
      return data?.children ?? [];
    },
    enabled,
    refetchInterval: opts?.refetchInterval ?? false,
    staleTime: opts?.staleTime ?? 10_000,
    retry: opts?.retry ?? 2,
  });
}
