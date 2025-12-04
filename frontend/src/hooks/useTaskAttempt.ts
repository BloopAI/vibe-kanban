import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useTaskAttempt(attemptId?: string) {
  return useQuery({
    queryKey: ['taskAttempt', attemptId],
    queryFn: () => attemptsApi.get(attemptId!),
    enabled: !!attemptId,
    placeholderData: (previousData) => previousData,
  });
}
