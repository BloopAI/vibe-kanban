import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import type { OrganizationMember } from 'shared/types';

interface UseOrganizationMembersQueryOptions {
  organizationId: string | null;
}

/**
 * Hook to fetch organization members for a specific organization
 */
export function useOrganizationMembersQuery(
  options: UseOrganizationMembersQueryOptions
) {
  const { organizationId } = options;

  return useQuery<OrganizationMember[]>({
    queryKey: ['organization', 'members', organizationId],
    queryFn: () => {
      if (!organizationId) {
        throw new Error('No organization ID provided');
      }
      return organizationsApi.getMembers(organizationId);
    },
    enabled: !!organizationId,
  });
}
