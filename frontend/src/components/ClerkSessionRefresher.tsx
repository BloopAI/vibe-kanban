import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { refreshClerkSession } from '../lib/api';

const CLERK_SESSION_REFRESH_INTERVAL_MS = 25_000;

export function ClerkSessionRefresher(): null {
  const { sessionId } = useAuth();

  useEffect(() => {
    if (!sessionId) {
      void refreshClerkSession();
      return;
    }

    void refreshClerkSession();

    const intervalId = window.setInterval(() => {
      void refreshClerkSession();
    }, CLERK_SESSION_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sessionId]);

  return null;
}

