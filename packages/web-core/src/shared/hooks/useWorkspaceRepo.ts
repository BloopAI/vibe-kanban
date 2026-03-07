import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { workspacesApi } from '@/shared/lib/api';
import type { RepoWithTargetBranch } from 'shared/types';

interface UseWorkspaceRepoOptions {
  enabled?: boolean;
}

export const workspaceRepoKeys = {
  byWorkspace: (workspaceId: string | undefined) =>
    ['workspaceRepos', workspaceId] as const,
  selection: (workspaceId: string | undefined) =>
    ['workspaceRepoSelection', workspaceId] as const,
};

export function useWorkspaceRepo(
  workspaceId?: string,
  options: UseWorkspaceRepoOptions = {}
) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  const query = useQuery<RepoWithTargetBranch[]>({
    queryKey: workspaceRepoKeys.byWorkspace(workspaceId),
    queryFn: async () => {
      const repos = await workspacesApi.getRepos(workspaceId!);
      return repos;
    },
    enabled: enabled && !!workspaceId,
  });

  const repos = useMemo(() => query.data ?? [], [query.data]);

  // Use React Query cache for shared state across all hook consumers
  const { data: selectedRepoId = null } = useQuery<string | null>({
    queryKey: workspaceRepoKeys.selection(workspaceId),
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
  });

  const setSelectedRepoId = useCallback(
    (id: string | null) => {
      queryClient.setQueryData(workspaceRepoKeys.selection(workspaceId), id);
    },
    [queryClient, workspaceId]
  );

  // Auto-select first repo when none selected
  useEffect(() => {
    if (repos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId, setSelectedRepoId]);

  return {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
