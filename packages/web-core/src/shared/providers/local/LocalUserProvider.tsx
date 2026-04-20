import { useMemo, type ReactNode } from 'react';
import {
  UserContext,
  type UserContextValue,
} from '@/shared/hooks/useUserContext';

interface LocalUserProviderProps {
  children: ReactNode;
}

/**
 * Local-first stub for UserProvider.
 * In local-first mode there are no remote cloud workspaces, so this
 * always provides empty data without attempting ElectricSQL sync.
 */
export function LocalUserProvider({ children }: LocalUserProviderProps) {
  const value = useMemo<UserContextValue>(
    () => ({
      workspaces: [],
      isLoading: false,
      error: null,
      retry: () => {},
      getWorkspacesForIssue: () => [],
    }),
    []
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
