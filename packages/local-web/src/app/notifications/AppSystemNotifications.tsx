import { useEffect, useRef } from 'react';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useNotificationMembers } from '@/shared/hooks/useNotificationMembers';
import { useNotifications } from '@/shared/hooks/useNotifications';
import { getGroupedNotificationText } from '@/shared/lib/notificationMessage';
import { showSystemNotification } from '@web/app/notifications/showSystemNotification';

export function AppSystemNotifications() {
  const { userId } = useAuth();
  const { data, enabled, groupedNotifications } = useNotifications();
  const { membersByUserId, isLoading, isFetching } =
    useNotificationMembers(data);
  const displayedNotificationIdsRef = useRef(new Set<string>());
  const initializedRef = useRef(false);

  useEffect(() => {
    displayedNotificationIdsRef.current.clear();
    initializedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!enabled || isLoading || isFetching) {
      return;
    }

    if (!initializedRef.current) {
      for (const group of groupedNotifications) {
        if (!group.seen) {
          displayedNotificationIdsRef.current.add(group.id);
        }
      }
      initializedRef.current = true;
      return;
    }

    const activeGroupIds = new Set(
      groupedNotifications.map((group) => group.id)
    );
    for (const id of displayedNotificationIdsRef.current) {
      if (!activeGroupIds.has(id)) {
        displayedNotificationIdsRef.current.delete(id);
      }
    }

    for (const group of groupedNotifications) {
      if (group.seen || displayedNotificationIdsRef.current.has(group.id)) {
        continue;
      }

      displayedNotificationIdsRef.current.add(group.id);
      void showSystemNotification({
        id: group.id,
        title: 'Vibe Kanban',
        body: getGroupedNotificationText(group, membersByUserId),
      });
    }
  }, [enabled, groupedNotifications, isFetching, isLoading, membersByUserId]);

  return null;
}
