import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import type { ExecutorProfileId } from 'shared/types';

type StartReviewParams = {
  executorProfileId: ExecutorProfileId;
  additionalPrompt?: string;
};

export function useStartReview(
  attemptId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: StartReviewParams) => {
      if (!attemptId) throw new Error('No attempt ID');
      return attemptsApi.startReview(attemptId, {
        executor_profile_id: params.executorProfileId,
        additional_prompt: params.additionalPrompt ?? null,
        use_all_workspace_commits: true,
      });
    },
    onSuccess: () => {
      // Refresh processes to show the new review session
      queryClient.invalidateQueries({ queryKey: ['processes', attemptId] });
      // Refresh branch status
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });
      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to start review:', err);
      onError?.(err);
    },
  });
}
