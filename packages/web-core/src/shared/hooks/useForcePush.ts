import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { PushError, PushWorkspaceRequest } from 'shared/types';

class ForcePushErrorWithData extends Error {
  constructor(
    message: string,
    public errorData?: PushError
  ) {
    super(message);
    this.name = 'ForcePushErrorWithData';
  }
}

export function useForcePush(
  workspaceId?: string,
  onSuccess?: () => void,
  onError?: (err: unknown, errorData?: PushError) => void
) {
  const queryClient = useQueryClient();

  return useMutation<void, unknown, PushWorkspaceRequest>({
    mutationFn: async (params: PushWorkspaceRequest) => {
      if (!workspaceId) return;
      const result = await workspacesApi.forcePush(workspaceId, params);
      if (!result.success) {
        throw new ForcePushErrorWithData(
          result.message || 'Force push failed',
          result.error
        );
      }
    },
    onSuccess: () => {
      // A force push affects remote status; invalidate the same branchStatus
      queryClient.invalidateQueries({
        queryKey: ['branchStatus', workspaceId],
      });
      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to force push:', err);
      const errorData =
        err instanceof ForcePushErrorWithData ? err.errorData : undefined;
      onError?.(err, errorData);
    },
  });
}
