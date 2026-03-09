import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '@/shared/lib/api';
import type { WorkspaceWithSession } from '@/shared/types/attempt';

export function useWorkspace(workspaceId?: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => workspacesApi.get(workspaceId!),
    enabled: !!workspaceId,
  });
}

/**
 * Hook for components that need executor field (e.g., for capability checks).
 * Fetches workspace with executor from latest session.
 */
export function useWorkspaceWithSession(workspaceId?: string) {
  return useQuery<WorkspaceWithSession>({
    queryKey: ['workspaceWithSession', workspaceId],
    queryFn: () => workspacesApi.getWithSession(workspaceId!),
    enabled: !!workspaceId,
  });
}
