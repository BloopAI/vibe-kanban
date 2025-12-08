import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

type MergeParams = {
  repoId: string;
};

export function useMerge(
  attemptId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, MergeParams>({
    mutationFn: (params: MergeParams) => {
      if (!attemptId) return Promise.resolve();
      return attemptsApi.merge(attemptId, {
        repo_id: params.repoId,
      });
    },
    onSuccess: () => {
      // Refresh attempt-specific branch information
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });

      // Invalidate all project branches queries
      queryClient.invalidateQueries({ queryKey: ['projectBranches'] });

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to merge:', err);
      onError?.(err);
    },
  });
}
