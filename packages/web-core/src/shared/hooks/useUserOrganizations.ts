import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/shared/lib/api';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import type { ListOrganizationsResponse } from 'shared/types';
import { organizationKeys } from '@/shared/hooks/organizationKeys';

/**
 * Hook to fetch all organizations that the current user is a member of
 */
export function useUserOrganizations() {
  const { isSignedIn } = useAuth();
  const { loginStatus } = useUserSystem();
  const isLocalOnlySession =
    loginStatus?.status === 'loggedin' && !loginStatus.profile;

  return useQuery<ListOrganizationsResponse>({
    queryKey: organizationKeys.userList(),
    queryFn: () => organizationsApi.getUserOrganizations(),
    enabled: isSignedIn && !isLocalOnlySession,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
