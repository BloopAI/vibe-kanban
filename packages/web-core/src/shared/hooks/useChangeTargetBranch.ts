import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type {
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
} from 'shared/types';
import { repoBranchKeys } from '@/shared/hooks/useRepoBranches';
import { workspaceRepoKeys } from '@/shared/hooks/useWorkspaceRepo';

type ChangeTargetBranchParams = {
  newTargetBranch: string;
  repoId: string;
};

export function useChangeTargetBranch(
  workspaceId: string | undefined,
  repoId: string | undefined,
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
      if (!workspaceId) {
        throw new Error('Attempt id is not set');
      }

      const payload: ChangeTargetBranchRequest = {
        new_target_branch: newTargetBranch,
        repo_id: repoId,
      };
      return workspacesApi.change_target_branch(workspaceId, payload);
    },
    onSuccess: (data) => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
        // Invalidate workspaceWithSession query to refresh attempt.target_branch
        queryClient.invalidateQueries({
          queryKey: ['workspaceWithSession', workspaceId],
        });
        // Refresh repos to update target_branch in RepoCard
        queryClient.invalidateQueries({
          queryKey: workspaceRepoKeys.byWorkspace(workspaceId),
        });
      }

      if (repoId) {
        queryClient.invalidateQueries({
          queryKey: repoBranchKeys.byRepo(repoId),
        });
      }

      onSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to change target branch:', err);
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
      }
      onError?.(err);
    },
  });
}
