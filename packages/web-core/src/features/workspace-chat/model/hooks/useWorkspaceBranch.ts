import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';

export function useWorkspaceBranch(workspaceId?: string) {
  const query = useQuery({
    queryKey: ['attemptBranch', workspaceId],
    queryFn: async () => {
      const attempt = await workspacesApi.get(workspaceId!);
      return attempt.branch ?? null;
    },
    enabled: !!workspaceId,
  });

  return {
    branch: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
