import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '../lib/api';
import { useUserSystem } from '@/components/ConfigProvider';
import type { ListOrganizationsResponse } from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

/**
 * Hook to fetch all organizations that the current user is a member of
 */
export function useUserOrganizations() {
  const { loginStatus } = useUserSystem();
  const isLoggedIn = loginStatus?.status === 'loggedin';

  return useQuery<ListOrganizationsResponse>({
    queryKey: ['user', 'organizations'],
    queryFn: () => organizationsApi.getUserOrganizations(),
    enabled: Boolean(isLoggedIn),
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
