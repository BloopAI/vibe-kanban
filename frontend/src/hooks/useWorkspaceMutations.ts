import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { attemptKeys } from '@/hooks/useAttempt';

interface ToggleArchiveParams {
  workspaceId: string;
  archived: boolean;
  nextWorkspaceId?: string | null;
}

interface TogglePinParams {
  workspaceId: string;
  pinned: boolean;
}

interface UseWorkspaceMutationsOptions {
  onArchiveSuccess?: (params: ToggleArchiveParams) => void;
}

export function useWorkspaceMutations(options?: UseWorkspaceMutationsOptions) {
  const queryClient = useQueryClient();

  const invalidateQueries = (workspaceId: string) => {
    queryClient.invalidateQueries({
      queryKey: attemptKeys.byId(workspaceId),
    });
  };

  const toggleArchive = useMutation({
    mutationFn: ({ workspaceId, archived }: ToggleArchiveParams) =>
      attemptsApi.update(workspaceId, { archived: !archived }),
    onSuccess: (_, params) => {
      invalidateQueries(params.workspaceId);
      options?.onArchiveSuccess?.(params);
    },
    onError: (err) => {
      console.error('Failed to toggle workspace archive:', err);
    },
  });

  const togglePin = useMutation({
    mutationFn: ({ workspaceId, pinned }: TogglePinParams) =>
      attemptsApi.update(workspaceId, { pinned: !pinned }),
    onSuccess: (_, { workspaceId }) => {
      invalidateQueries(workspaceId);
    },
    onError: (err) => {
      console.error('Failed to toggle workspace pin:', err);
    },
  });

  return {
    toggleArchive,
    togglePin,
  };
}
