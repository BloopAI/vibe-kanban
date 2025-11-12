import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import type { OrganizationMember } from 'shared/types';

/**
 * Fetch members for a specific organization. Fetching is disabled when the
 * organization identifier is not provided.
 */
export function useOrganizationMembers(organizationId?: string) {
  return useQuery<OrganizationMember[]>({
    queryKey: ['organization', 'members', organizationId],
    queryFn: () => {
      if (!organizationId) {
        throw new Error('No organization ID available');
      }
      return organizationsApi.getMembers(organizationId);
    },
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
