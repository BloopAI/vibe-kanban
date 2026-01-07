import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

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
        queryClient.invalidateQueries({ queryKey: ['taskAttempt', attemptId] });
        queryClient.invalidateQueries({ queryKey: ['attempt', attemptId] });
        queryClient.invalidateQueries({
          queryKey: ['attemptBranch', attemptId],
        });
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });
        queryClient.invalidateQueries({ queryKey: ['taskAttempts'] });
      }
      onSuccess?.(data.branch);
    },
    onError: (err) => {
      console.error('Failed to rename branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });
      }
      onError?.(err);
    },
  });
}
