import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type {
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
} from 'shared/types';
import { branchStatusKeys } from './useBranchStatus';
import { taskAttemptKeys } from './useTaskAttempt';
import { branchKeys } from './useBranches';

type ChangeTargetBranchParams = {
  newTargetBranch: string;
  repoId: string;
};

export function useChangeTargetBranch(
  attemptId: string | undefined,
  projectId: string | undefined,
  onSuccess?: (data: ChangeTargetBranchResponse) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<
    ChangeTargetBranchResponse,
    unknown,
    ChangeTargetBranchParams
  >({
    mutationFn: async ({ newTargetBranch, repoId }) => {
      if (!attemptId) {
        throw new Error('Attempt id is not set');
      }

      const payload: ChangeTargetBranchRequest = {
        new_target_branch: newTargetBranch,
        repo_id: repoId,
      };
      return attemptsApi.change_target_branch(attemptId, payload);
    },
    onSuccess: (data) => {
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: branchStatusKeys.byAttempt(attemptId),
        });
        // Invalidate taskAttempt query to refresh attempt.target_branch
        queryClient.invalidateQueries({
          queryKey: taskAttemptKeys.byId(attemptId),
        });
      }

      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: branchKeys.byProject(projectId),
        });
      }

      onSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to change target branch:', err);
      if (attemptId) {
        queryClient.invalidateQueries({
          queryKey: branchStatusKeys.byAttempt(attemptId),
        });
      }
      onError?.(err);
    },
  });
}
