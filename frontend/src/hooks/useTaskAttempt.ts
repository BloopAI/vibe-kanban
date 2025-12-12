import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export const taskAttemptKeys = {
  byId: (attemptId: string | undefined) => ['taskAttempt', attemptId] as const,
};

export function useTaskAttempt(attemptId?: string) {
  return useQuery({
    queryKey: taskAttemptKeys.byId(attemptId),
    queryFn: () => attemptsApi.get(attemptId!),
    enabled: !!attemptId,
  });
}
