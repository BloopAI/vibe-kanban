import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import { getHostRequestScopeQueryKey } from '@/shared/lib/hostRequestScope';
import { useHostId } from '@/shared/providers/HostIdProvider';
import type { Workspace } from 'shared/types';

export const workspaceRecordKeys = {
  byId: (workspaceId: string | undefined, hostId: string | null = null) =>
    [
      'workspaceRecord',
      getHostRequestScopeQueryKey(hostId),
      workspaceId,
    ] as const,
};

type Options = {
  enabled?: boolean;
};

export function useWorkspaceRecord(workspaceId?: string, opts?: Options) {
  const hostId = useHostId();
  const enabled = (opts?.enabled ?? true) && !!workspaceId;

  return useQuery<Workspace>({
    queryKey: workspaceRecordKeys.byId(workspaceId, hostId),
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled,
  });
}
