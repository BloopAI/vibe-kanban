import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi, Result } from '@/shared/lib/api';
import type { RebaseWorkspaceRequest } from 'shared/types';
import type { GitOperationError } from 'shared/types';
import { repoBranchKeys } from '@/shared/hooks/useRepoBranches';
import { workspaceRepoKeys } from '@/shared/hooks/useWorkspaceRepo';

export function useRebase(
  workspaceId: string | undefined,
  repoId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: Result<void, GitOperationError>) => void
) {
  const queryClient = useQueryClient();

  type RebaseMutationArgs = {
    repoId: string;
    newBaseBranch?: string;
    oldBaseBranch?: string;
  };

  return useMutation<void, Result<void, GitOperationError>, RebaseMutationArgs>(
    {
      mutationFn: (args) => {
        if (!workspaceId) return Promise.resolve();
        const { repoId, newBaseBranch, oldBaseBranch } = args ?? {};

        const data: RebaseWorkspaceRequest = {
          repo_id: repoId,
          old_base_branch: oldBaseBranch ?? null,
          new_base_branch: newBaseBranch ?? null,
        };

        return workspacesApi.rebase(workspaceId, data).then((res) => {
          if (!res.success) {
            // Propagate typed failure Result for caller to handle (no manual ApiError construction)
            return Promise.reject(res);
          }
        });
      },
      onSuccess: () => {
        // Refresh branch status immediately
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

        // Refresh branch list
        if (repoId) {
          queryClient.invalidateQueries({
            queryKey: repoBranchKeys.byRepo(repoId),
          });
        }

        onSuccess?.();
      },
      onError: (err: Result<void, GitOperationError>) => {
        console.error('Failed to rebase:', err);
        // Even on failure (likely conflicts), re-fetch branch status immediately to show rebase-in-progress
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
        onError?.(err);
      },
    }
  );
}
