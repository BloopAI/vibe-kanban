import { useMutation, useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import { workspaceRecordKeys } from '@/shared/hooks/useWorkspaceRecord';
import type { Workspace } from 'shared/types';

interface RenameBranchContext {
  previousWorkspace: Workspace | undefined;
}

export function useRenameBranch(
  workspaceId?: string,
  onSuccess?: (newBranchName: string) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<{ branch: string }, unknown, string, RenameBranchContext>({
    mutationFn: async (newBranchName) => {
      if (!workspaceId) throw new Error('Workspace id is not set');
      return workspacesApi.renameBranch(workspaceId, newBranchName);
    },
    onMutate: async (newBranchName) => {
      if (!workspaceId) return { previousWorkspace: undefined };

      await queryClient.cancelQueries({
        queryKey: workspaceRecordKeys.byId(workspaceId),
      });

      // Snapshot the previous value
      const previousWorkspace = queryClient.getQueryData<Workspace>(
        workspaceRecordKeys.byId(workspaceId)
      );

      // Optimistically update the cache
      queryClient.setQueryData<Workspace>(
        workspaceRecordKeys.byId(workspaceId),
        (old) => {
          if (!old) return old;
          return { ...old, branch: newBranchName };
        }
      );

      // Return context with the previous value
      return { previousWorkspace };
    },
    onSuccess: (data) => {
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ['workspaceWithSession', workspaceId],
        });
        queryClient.invalidateQueries({
          queryKey: workspaceRecordKeys.byId(workspaceId),
        });
        queryClient.invalidateQueries({
          queryKey: ['attemptBranch', workspaceId],
        });
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
        queryClient.invalidateQueries({ queryKey: ['taskWorkspaces'] });
      }
      onSuccess?.(data.branch);
    },
    onError: (err, _newBranchName, context) => {
      console.error('Failed to rename branch:', err);
      // Rollback to the previous value on error
      if (workspaceId && context?.previousWorkspace) {
        queryClient.setQueryData(
          workspaceRecordKeys.byId(workspaceId),
          context.previousWorkspace
        );
      }
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ['branchStatus', workspaceId],
        });
      }
      onError?.(err);
    },
  });
}
