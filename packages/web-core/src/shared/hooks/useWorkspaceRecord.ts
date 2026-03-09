import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { Workspace } from 'shared/types';

export const workspaceRecordKeys = {
  byId: (workspaceId: string | undefined) =>
    ['workspaceRecord', workspaceId] as const,
};

type Options = {
  enabled?: boolean;
};

export function useWorkspaceRecord(workspaceId?: string, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!workspaceId;

  return useQuery<Workspace>({
    queryKey: workspaceRecordKeys.byId(workspaceId),
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled,
  });
}
