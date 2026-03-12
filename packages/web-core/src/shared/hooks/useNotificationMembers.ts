import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { Notification } from 'shared/remote-types';
import type { OrganizationMemberWithProfile } from 'shared/types';
import { organizationKeys } from '@/shared/hooks/organizationKeys';
import { organizationsApi } from '@/shared/lib/api';

export function useNotificationMembers(notifications: Notification[]) {
  const organizationIds = useMemo(
    () =>
      Array.from(
        new Set(
          notifications.map((notification) => notification.organization_id)
        )
      ),
    [notifications]
  );

  const memberQueries = useQueries({
    queries: organizationIds.map((organizationId) => ({
      queryKey: organizationKeys.members(organizationId),
      queryFn: () => organizationsApi.getMembers(organizationId),
      enabled: Boolean(organizationId),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const membersByUserId = useMemo(() => {
    const map = new Map<string, OrganizationMemberWithProfile>();

    for (const query of memberQueries) {
      for (const member of query.data ?? []) {
        map.set(member.user_id, member);
      }
    }

    return map;
  }, [memberQueries]);

  return {
    membersByUserId,
    isLoading: memberQueries.some((query) => query.isLoading),
    isFetching: memberQueries.some((query) => query.isFetching),
    isError: memberQueries.some((query) => query.isError),
  };
}
