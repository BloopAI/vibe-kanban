import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useRenameBranch(
  attemptId: string | undefined,
  projectId: string | undefined,
  onSuccess?: (data: { new_branch_name: string }) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<{ new_branch_name: string }, unknown, string>({
    mutationFn: async (newBranchName) => {
      if (!attemptId) {
        throw new Error('Attempt id is not set');
      }

      const payload = {
        new_branch_name: newBranchName,
      };
      return attemptsApi.rename_branch(attemptId, payload);
    },
    onSuccess: (data) => {
      if (attemptId) {
        // Invalidate taskAttempt query to refresh attempt.branch
        queryClient.invalidateQueries({
          queryKey: ['taskAttempt', attemptId],
        });
      }

      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ['projectBranches', projectId],
        });
      }

      onSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to rename branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: ['taskAttempt', attemptId],
        });
      }
      onError?.(err);
    },
  });
}
