import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, Result } from '@/lib/api';
import type { RebaseTaskAttemptRequest } from 'shared/types';
import type { GitOperationError } from 'shared/types';

export function useRebase(
  attemptId: string | undefined,
  projectId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: Result<void, GitOperationError>) => void
) {
  const queryClient = useQueryClient();

  type RebaseMutationArgs = {
    newBaseBranch?: string;
    oldBaseBranch?: string;
  };

  return useMutation<void, Result<void, GitOperationError>, RebaseMutationArgs>(
    {
      mutationFn: (args) => {
        if (!attemptId) return Promise.resolve();
        const { newBaseBranch, oldBaseBranch } = args ?? {};

        const data: RebaseTaskAttemptRequest = {
          old_base_branch: oldBaseBranch ?? null,
          new_base_branch: newBaseBranch ?? null,
        };

        return attemptsApi.rebase(attemptId, data).then((res) => {
          if (!res.success) {
            // Propagate typed failure Result for caller to handle (no manual ApiError construction)
            return Promise.reject(res);
          }
        });
      },
      onSuccess: () => {
        // Refresh branch status immediately
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });

        // Refresh branch list used by PR dialog
        if (projectId) {
          queryClient.invalidateQueries({
            queryKey: ['projectBranches', projectId],
          });
        }

        onSuccess?.();
      },
      onError: (err: Result<void, GitOperationError>) => {
        console.error('Failed to rebase:', err);
        // Even on failure (likely conflicts), re-fetch branch status immediately to show rebase-in-progress
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });
        onError?.(err);
      },
    }
  );
}
