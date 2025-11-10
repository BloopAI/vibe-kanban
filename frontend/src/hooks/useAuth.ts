import { useUserSystem } from '../components/config-provider';

/**
 * Simple auth hook that wraps UserSystemProvider's loginStatus
 * This replaces Clerk's useAuth() hook
 */
export function useAuth() {
  const { loginStatus } = useUserSystem();

  return {
    isSignedIn: loginStatus?.status === 'loggedin',
    isLoaded: loginStatus !== null,
    userId: loginStatus?.status === 'loggedin' ? 'user' : null, // Backend handles actual userId
  };
}
