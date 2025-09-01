import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi, type Result } from '@/lib/api';
import type { CreateGitHubPrRequest, GitHubServiceError } from 'shared/types';

export function useCreatePR(
  attemptId: string | undefined,
  onSuccess?: (prUrl?: string) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<
    Result<string, GitHubServiceError>,
    Error,
    CreateGitHubPrRequest
  >({
    mutationFn: async (prData: CreateGitHubPrRequest) => {
      if (!attemptId)
        return { success: false, error: undefined, message: 'No attempt ID' };
      return attemptsApi.createPR(attemptId, prData);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', attemptId],
        });
        onSuccess?.(result.data);
      } else {
        throw (
          result.error || new Error(result.message || 'Failed to create PR')
        );
      }
    },
    onError: (err) => {
      console.error('Failed to create PR:', err);
      onError?.(err);
    },
  });
}
