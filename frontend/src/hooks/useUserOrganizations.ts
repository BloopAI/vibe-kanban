import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '../lib/api';
import { useUserSystem } from '@/components/ConfigProvider';
import type { ListOrganizationsResponse } from 'shared/types';

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
  });
}
