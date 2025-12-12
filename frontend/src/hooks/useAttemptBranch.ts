import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export const attemptBranchKeys = {
  byAttempt: (attemptId: string | undefined) =>
    ['attemptBranch', attemptId] as const,
};

export function useAttemptBranch(attemptId?: string) {
  const query = useQuery({
    queryKey: attemptBranchKeys.byAttempt(attemptId),
    queryFn: async () => {
      const attempt = await attemptsApi.get(attemptId!);
      return attempt.branch ?? null;
    },
    enabled: !!attemptId,
  });

  return {
    branch: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
