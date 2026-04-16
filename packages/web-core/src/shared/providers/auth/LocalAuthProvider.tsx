import { useMemo, type ReactNode } from 'react';
import {
  AuthContext,
  type AuthContextValue,
} from '@/shared/hooks/auth/useAuth';
import { useUserSystem } from '@/shared/hooks/useUserSystem';

interface LocalAuthProviderProps {
  children: ReactNode;
}

export function LocalAuthProvider({ children }: LocalAuthProviderProps) {
  const { loginStatus } = useUserSystem();
  const isRemoteSignedIn =
    loginStatus?.status === 'loggedin' && !!loginStatus.profile;

  const value = useMemo<AuthContextValue>(
    () => ({
      isSignedIn: isRemoteSignedIn,
      isLoaded: loginStatus !== null,
      userId: isRemoteSignedIn ? (loginStatus?.profile?.user_id ?? null) : null,
    }),
    [isRemoteSignedIn, loginStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
