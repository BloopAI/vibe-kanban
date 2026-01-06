import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter } from '@/lib/api';

/**
 * AuthInitializer sets up the API auth token getter using Clerk's getToken.
 * This component should be rendered inside the ClerkProvider.
 * It doesn't render anything visible.
 */
export function AuthInitializer() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (isSignedIn) {
      // Set up the token getter for the API module
      setAuthTokenGetter(async () => {
        try {
          return await getToken();
        } catch (e) {
          console.warn('Failed to get Clerk token:', e);
          return null;
        }
      });
    } else {
      // Clear the token getter when signed out
      setAuthTokenGetter(async () => null);
    }
  }, [getToken, isSignedIn]);

  return null;
}
