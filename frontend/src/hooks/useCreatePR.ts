import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import type { CreateGitHubPrRequest } from 'shared/types';

export function useCreatePR(
  attemptId: string | undefined,
  onSuccess?: (prUrl?: string) => void,
  onError?: (err: unknown) => void
) {
  return useCallback(
    async (prData: CreateGitHubPrRequest) => {
      if (!attemptId) return;

      try {
        const result = await attemptsApi.createPR(attemptId, prData);

        if (result.success) {
          onSuccess?.(result.data);
          return result.data;
        } else {
          throw result.error || new Error(result.message);
        }
      } catch (err) {
        console.error('Failed to create PR:', err);
        onError?.(err);
      }
    },
    [attemptId, onSuccess, onError]
  );
}
