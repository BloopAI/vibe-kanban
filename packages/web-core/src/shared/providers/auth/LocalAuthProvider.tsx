import { useMemo, type ReactNode } from 'react';
import {
  AuthContext,
  type AuthContextValue,
} from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { useCloudAvailable } from '@/shared/hooks/useCloudAvailability';

interface LocalAuthProviderProps {
  children: ReactNode;
}

export function LocalAuthProvider({ children }: LocalAuthProviderProps) {
  const { loginStatus } = useUserSystem();
  const cloudAvailable = useCloudAvailable();

  const value = useMemo<AuthContextValue>(() => {
    // Without a cloud there is nothing to be signed in to.
    const isSignedIn = cloudAvailable && loginStatus?.status === 'loggedin';
    return {
      isSignedIn,
      isLoaded: loginStatus !== null,
      userId:
        isSignedIn && loginStatus?.status === 'loggedin'
          ? (loginStatus.profile?.user_id ?? null)
          : null,
    };
  }, [cloudAvailable, loginStatus]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
