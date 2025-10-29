import { useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import { refreshClerkSession } from '../lib/clerk';

// Clerk session tokens only live ~60s as part of Clerk's hybrid auth model (https://clerk.com/docs/guides/how-clerk-works/overview).
// Refreshing just under halfway (25s) keeps our backend's registered token comfortably ahead of expiry so server requests stay authenticated.
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
