import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '@/lib/api';
import type { ExecutorProfileId } from 'shared/types';

type StartReviewParams = {
  executorProfileId: ExecutorProfileId;
  additionalPrompt?: string;
};

export function useStartReview(
  sessionId?: string,
  workspaceId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: StartReviewParams) => {
      if (!sessionId) throw new Error('No session ID');
      return sessionsApi.startReview(sessionId, {
        executor_profile_id: params.executorProfileId,
        additional_prompt: params.additionalPrompt ?? null,
        use_all_workspace_commits: true,
      });
    },
    onSuccess: () => {
      // Refresh processes to show the new review session
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: ['processes', workspaceId] });
        // Refresh branch status
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
      }
      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to start review:', err);
      onError?.(err);
    },
  });
}
