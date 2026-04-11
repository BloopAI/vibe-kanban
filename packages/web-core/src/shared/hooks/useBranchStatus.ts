import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';

export function useBranchStatus(workspaceId?: string) {
  return useQuery({
    queryKey: ['branchStatus', workspaceId],
    queryFn: () => workspacesApi.getBranchStatus(workspaceId!),
    enabled: !!workspaceId,
    refetchInterval: 5000,
  });
}
