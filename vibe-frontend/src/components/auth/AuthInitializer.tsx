import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { setAuthTokenGetter } from '@/lib/api';

/**
 * AuthInitializer sets up the API auth token getter using Clerk's getToken.
 * This component should be rendered inside the ClerkProvider.
 * It doesn't render anything visible.
 */
export function AuthInitializer() {
  const { getToken, isSignedIn, isLoaded } = useAuth();

  useEffect(() => {
    // Don't set up token getter until Clerk is fully loaded
    // This prevents setting a null getter during initial load
    if (!isLoaded) {
      return;
    }

    if (isSignedIn) {
      // Set up the token getter for the API module
      setAuthTokenGetter(async () => {
        try {
          const token = await getToken();
          if (!token) {
            console.warn('Clerk getToken() returned null - user may need to re-authenticate');
          }
          return token;
        } catch (e) {
          console.warn('Failed to get Clerk token:', e);
          return null;
        }
      });
    } else {
      // Clear the token getter when signed out
      setAuthTokenGetter(async () => null);
    }
  }, [getToken, isSignedIn, isLoaded]);

  return null;
}
