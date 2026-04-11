import { getHostRequestScopeQueryKey } from '@/shared/lib/hostRequestScope';

export const workspaceSessionKeys = {
  byWorkspace: (
    workspaceId: string | undefined,
    hostId: string | null = null
  ) =>
    [
      'workspaceSessions',
      getHostRequestScopeQueryKey(hostId),
      workspaceId,
    ] as const,
};
