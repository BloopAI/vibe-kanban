import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function usePush(
  attemptId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      if (!attemptId) return Promise.resolve();
      return attemptsApi.push(attemptId);
    },
    onSuccess: () => {
      // A push only affects remote status; invalidate the same branchStatus
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });
      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to push:', err);
      onError?.(err);
    },
  });
}
