import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '../lib/api';
import type { RemoteProject } from 'shared/types';

export const organizationProjectsKeys = {
  byOrg: (organizationId: string | null) =>
    ['organizations', organizationId, 'projects'] as const,
};

export function useOrganizationProjects(organizationId: string | null) {
  return useQuery<RemoteProject[]>({
    queryKey: organizationProjectsKeys.byOrg(organizationId),
    queryFn: async () => {
      if (!organizationId) return [];
      const projects = await organizationsApi.getProjects(organizationId);
      return projects || [];
    },
    enabled: Boolean(organizationId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
