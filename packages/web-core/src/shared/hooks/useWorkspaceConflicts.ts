import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';

export function useWorkspaceConflicts(workspaceId?: string, repoId?: string) {
  const queryClient = useQueryClient();

  const abortConflicts = useCallback(async () => {
    if (!workspaceId || !repoId) return;
    await workspacesApi.abortConflicts(workspaceId, { repo_id: repoId });
    await queryClient.invalidateQueries({
      queryKey: ['branchStatus', workspaceId],
    });
  }, [workspaceId, repoId, queryClient]);

  return { abortConflicts } as const;
}
