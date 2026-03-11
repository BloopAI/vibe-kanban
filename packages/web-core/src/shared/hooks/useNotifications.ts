import { useMemo } from 'react';
import { useShape } from '@/shared/integrations/electric/hooks';
import {
  NOTIFICATIONS_SHAPE,
  NOTIFICATION_MUTATION,
} from 'shared/remote-types';
import { useAuth } from '@/shared/hooks/auth/useAuth';

export function useNotifications() {
  const { isSignedIn, userId } = useAuth();

  const enabled = isSignedIn && !!userId;

  const result = useShape(
    NOTIFICATIONS_SHAPE,
    {
      user_id: userId || '',
    },
    {
      enabled,
      mutation: NOTIFICATION_MUTATION,
    }
  );

  const unseenCount = useMemo(
    () => result.data.filter((n) => !n.seen).length,
    [result.data]
  );

  return { ...result, enabled, unseenCount };
}
