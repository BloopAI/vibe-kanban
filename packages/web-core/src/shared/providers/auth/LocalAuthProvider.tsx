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
  // Local VK can run without a cloud profile; if the backend reports
  // `loggedin`, treat that as authenticated for local-only UI gating.
  const isSignedIn = loginStatus?.status === 'loggedin';

  const value = useMemo<AuthContextValue>(
    () => ({
      isSignedIn: isSignedIn,
      isLoaded: loginStatus !== null,
      userId: isSignedIn ? (loginStatus?.profile?.user_id ?? null) : null,
    }),
    [isSignedIn, loginStatus]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
