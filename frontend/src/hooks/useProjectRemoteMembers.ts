import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { RemoteProjectMembersResponse } from 'shared/types';

export const projectRemoteMembersKeys = {
  byProject: (projectId: string | undefined) =>
    ['project', 'remote-members', projectId] as const,
};

export function useProjectRemoteMembers(projectId?: string) {
  return useQuery<RemoteProjectMembersResponse, Error>({
    queryKey: projectRemoteMembersKeys.byProject(projectId),
    queryFn: () => projectsApi.getRemoteMembers(projectId!),
    enabled: Boolean(projectId),
    staleTime: 5 * 60 * 1000,
  });
}
