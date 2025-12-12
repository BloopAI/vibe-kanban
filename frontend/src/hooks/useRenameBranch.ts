import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { taskAttemptKeys } from './useTaskAttempt';
import { attemptKeys } from './useAttempt';
import { attemptBranchKeys } from './useAttemptBranch';
import { branchStatusKeys } from './useBranchStatus';
import { taskAttemptKeys as taskAttemptsKeys } from './useTaskAttempts';

export function useRenameBranch(
  attemptId?: string,
  onSuccess?: (newBranchName: string) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<{ branch: string }, unknown, string>({
    mutationFn: async (newBranchName) => {
      if (!attemptId) throw new Error('Attempt id is not set');
      return attemptsApi.renameBranch(attemptId, newBranchName);
    },
    onSuccess: (data) => {
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: taskAttemptKeys.byId(attemptId),
        });
        queryClient.invalidateQueries({
          queryKey: attemptKeys.byId(attemptId),
        });
        queryClient.invalidateQueries({
          queryKey: attemptBranchKeys.byAttempt(attemptId),
        });
        queryClient.invalidateQueries({
          queryKey: branchStatusKeys.byAttempt(attemptId),
        });
        queryClient.invalidateQueries({ queryKey: taskAttemptsKeys.all });
      }
      onSuccess?.(data.branch);
    },
    onError: (err) => {
      console.error('Failed to rename branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: branchStatusKeys.byAttempt(attemptId),
        });
      }
      onError?.(err);
    },
  });
}
