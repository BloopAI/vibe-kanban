import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { RebaseTaskAttemptRequest } from 'shared/types';

export function useRebase(
  attemptId: string | undefined,
  projectId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (newBaseBranch?: string) => {
      if (!attemptId) return Promise.resolve();

      const data: RebaseTaskAttemptRequest = {
        new_base_branch: newBaseBranch || null,
      };
      return attemptsApi.rebase(attemptId, data);
    },
    onSuccess: () => {
      // Refresh branch status immediately
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });

      // Refresh branch list used by PR dialog
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: ['projectBranches', projectId],
        });
      }

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to rebase:', err);
      onError?.(err);
    },
  });
}
