import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';

type Options = {
  enabled?: boolean;
  refetchInterval?: number | false;
};

export function useBranchStatus(workspaceId?: string, opts?: Options) {
  return useQuery({
    queryKey: ['branchStatus', workspaceId],
    queryFn: () => workspacesApi.getBranchStatus(workspaceId!),
    enabled: (opts?.enabled ?? true) && !!workspaceId,
    staleTime: 30000,
    refetchInterval: opts?.refetchInterval ?? false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
