import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useAttemptConflicts(attemptId?: string) {
  const queryClient = useQueryClient();

  const abortConflicts = useCallback(async () => {
    if (!attemptId) return;
    await attemptsApi.abortConflicts(attemptId);
    await queryClient.invalidateQueries({
      queryKey: ['branchStatus', attemptId],
    });
  }, [attemptId, queryClient]);

  return { abortConflicts } as const;
}
