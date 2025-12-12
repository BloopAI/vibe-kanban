import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export const branchStatusKeys = {
  byAttempt: (attemptId: string | undefined) =>
    ['branchStatus', attemptId] as const,
};

export function useBranchStatus(attemptId?: string) {
  return useQuery({
    queryKey: branchStatusKeys.byAttempt(attemptId),
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    refetchInterval: 5000,
  });
}
