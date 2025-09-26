import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type {
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
} from 'shared/types';

export function useChangeTargetBranch(
  attemptId: string | undefined,
  projectId: string | undefined,
  onSuccess?: (data: ChangeTargetBranchResponse) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<ChangeTargetBranchResponse, unknown, string>({
    mutationFn: async (newTargetBranch) => {
      if (!attemptId) {
        throw new Error('Attempt id is not set');
      }

      const payload: ChangeTargetBranchRequest = {
        new_target_branch: newTargetBranch,
      };
      return attemptsApi.change_target_branch(attemptId, payload);
    },
    onSuccess: (data) => {
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
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
      console.error('Failed to change target branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });
      }
      onError?.(err);
    },
  });
}
