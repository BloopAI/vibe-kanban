import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import { useUserSystem } from '@/components/config-provider';
import type { OrganizationMember } from 'shared/types';

/**
 * Hook to fetch organization members for the current user's organization
 */
export function useOrganizationMembers() {
  const { loginStatus } = useUserSystem();

  const organizationId =
    loginStatus?.status === 'loggedin'
      ? loginStatus.profile.organization_id
      : null;

  return useQuery<OrganizationMember[]>({
    queryKey: ['organization', 'members', organizationId],
    queryFn: () => {
      if (!organizationId) {
        throw new Error('No organization ID available');
      }
      return organizationsApi.getMembers(organizationId);
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
