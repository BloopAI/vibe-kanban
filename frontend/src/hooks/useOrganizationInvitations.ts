import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import { InvitationStatus, type Invitation } from 'shared/types';

interface UseOrganizationInvitationsOptions {
  organizationId: string | null;
  isAdmin: boolean;
}

/**
 * Hook to fetch pending invitations for an organization (admin only)
 */
export function useOrganizationInvitations(
  options: UseOrganizationInvitationsOptions
) {
  const { organizationId, isAdmin } = options;

  return useQuery<Invitation[]>({
    queryKey: ['organization', 'invitations', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        throw new Error('No organization ID provided');
      }
      const invitations =
        await organizationsApi.listInvitations(organizationId);
      // Only return pending invitations
      return invitations.filter(
        (inv) => inv.status === InvitationStatus.PENDING
      );
    },
    enabled: !!organizationId && !!isAdmin,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
