import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, attemptsApi } from '@/lib/api';
import type { GitOperationError } from 'shared/types';
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
      return attemptsApi.rebase(attemptId, data).then((res) => {
        if (!res.success) {
          // Throw a typed ApiError so callers can branch on error_data
          throw new ApiError<GitOperationError>(
            res.message || 'Rebase failed',
            409,
            undefined,
            res.error
          );
        }
      });
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
      // Even on failure (likely conflicts), re-fetch branch status immediately to show rebase-in-progress
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });
      onError?.(err);
    },
  });
}
