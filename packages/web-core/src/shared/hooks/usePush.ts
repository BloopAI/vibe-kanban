import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { PushError, PushWorkspaceRequest } from 'shared/types';

class PushErrorWithData extends Error {
  constructor(
    message: string,
    public errorData?: PushError
  ) {
    super(message);
    this.name = 'PushErrorWithData';
  }
}

export function usePush(
  workspaceId?: string,
  onSuccess?: () => void,
  onError?: (
    err: unknown,
    errorData?: PushError,
    params?: PushWorkspaceRequest
  ) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, PushWorkspaceRequest>({
    mutationFn: async (params: PushWorkspaceRequest) => {
      if (!workspaceId) return;
      const result = await workspacesApi.push(workspaceId, params);
      if (!result.success) {
        throw new PushErrorWithData(
          result.message || 'Push failed',
          result.error
        );
      }
    },
    onSuccess: () => {
      // A push only affects remote status; invalidate the same branchStatus
      queryClient.invalidateQueries({
        queryKey: ['branchStatus', workspaceId],
      });
      onSuccess?.();
    },
    onError: (err, variables) => {
      console.error('Failed to push:', err);
      const errorData =
        err instanceof PushErrorWithData ? err.errorData : undefined;
      onError?.(err, errorData, variables);
    },
  });
}
