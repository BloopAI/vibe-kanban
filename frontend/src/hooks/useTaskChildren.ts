import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { TaskRelationships } from 'shared/types';

export const taskRelationshipsKeys = {
  all: ['taskRelationships'] as const,
  byAttempt: (attemptId: string | undefined) =>
    ['taskRelationships', attemptId] as const,
};

// Keep the old export for backwards compatibility during migration
export const taskChildrenKeys = taskRelationshipsKeys;

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
  staleTime?: number;
  retry?: number | false;
};

export function useTaskRelationships(attemptId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!attemptId;

  return useQuery<TaskRelationships>({
    queryKey: taskRelationshipsKeys.byAttempt(attemptId),
    queryFn: async () => {
      const data = await attemptsApi.getChildren(attemptId!);
      return data;
    },
    enabled,
    refetchInterval: opts?.refetchInterval ?? false,
    staleTime: opts?.staleTime ?? 10_000,
    retry: opts?.retry ?? 2,
  });
}

// Keep the old export for backwards compatibility during migration
export const useTaskChildren = useTaskRelationships;
