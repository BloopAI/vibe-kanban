import { useMemo, type ReactNode } from 'react';
import {
  AuthContext,
  type AuthContextValue,
} from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';
import { LOCAL_USER_ID } from '@/shared/lib/localIdentity';

interface LocalAuthProviderProps {
  children: ReactNode;
}

export function LocalAuthProvider({ children }: LocalAuthProviderProps) {
  const { loginStatus } = useUserSystem();

  const value = useMemo<AuthContextValue>(
    () => ({
      isSignedIn: true,
      isLoaded: true,
      userId:
        loginStatus?.status === 'loggedin'
          ? (loginStatus.profile?.user_id ?? LOCAL_USER_ID)
          : LOCAL_USER_ID,
    }),
    [loginStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
