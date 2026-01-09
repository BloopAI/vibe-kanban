import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/api';
import type { OrganizationMemberWithProfile } from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

export function useOrganizationMembers(organizationId?: string) {
  return useQuery<OrganizationMemberWithProfile[]>({
    queryKey: ['organization', 'members', organizationId],
    queryFn: () => {
      if (!organizationId) {
        throw new Error('No organization ID available');
      }
      return organizationsApi.getMembers(organizationId);
    },
    enabled: Boolean(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });
}
