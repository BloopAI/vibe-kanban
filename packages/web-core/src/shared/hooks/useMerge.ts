import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import { repoBranchKeys } from '@/shared/hooks/useRepoBranches';

type MergeParams = {
  repoId: string;
};

export function useMerge(
  workspaceId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, MergeParams>({
    mutationFn: (params: MergeParams) => {
      if (!workspaceId) return Promise.resolve();
      return workspacesApi.merge(workspaceId, {
        repo_id: params.repoId,
      });
    },
    onSuccess: () => {
      // Refresh attempt-specific branch information
      queryClient.invalidateQueries({
        queryKey: ['branchStatus', workspaceId],
      });

      // Invalidate all repo branches queries
      queryClient.invalidateQueries({ queryKey: repoBranchKeys.all });

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to merge:', err);
      onError?.(err);
    },
  });
}
