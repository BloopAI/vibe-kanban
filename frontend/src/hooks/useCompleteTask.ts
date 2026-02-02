import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useCompleteTask(
  attemptId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, void>({
    mutationFn: () => {
      if (!attemptId) return Promise.resolve();
      return attemptsApi.complete(attemptId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branchStatus', attemptId] });

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to complete task:', err);
      onError?.(err);
    },
  });
}
