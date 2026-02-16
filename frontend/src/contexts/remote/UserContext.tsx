import { useContext, useMemo, useCallback, type ReactNode } from 'react';
import { createHmrContext } from '@/lib/hmrContext.ts';
import { useShape } from '@/lib/electric/hooks';
import { USER_WORKSPACES_SHAPE, type Workspace } from 'shared/remote-types';
import type { SyncError } from '@/lib/electric/types';
import { useAuth } from '@/hooks/auth/useAuth';

/**
 * UserContext provides user-scoped data.
 *
 * Shapes synced at user scope:
 * - Workspaces (data only, scoped by owner_user_id)
 */
export interface UserContextValue {
  // Data
  workspaces: Workspace[];

  // Loading/error state
  isLoading: boolean;
  error: SyncError | null;
  retry: () => void;

  // Lookup helpers
  getWorkspacesForIssue: (issueId: string) => Workspace[];
}

export const UserContext = createHmrContext<UserContextValue | null>(
  'UserContext',
  null
);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const { isSignedIn } = useAuth();

  // No params needed - backend gets user from auth context
  const params = useMemo(() => ({}), []);
  const enabled = isSignedIn;

  // Shape subscriptions
  const workspacesResult = useShape(USER_WORKSPACES_SHAPE, params, { enabled });

  // Lookup helpers
  const getWorkspacesForIssue = useCallback(
    (issueId: string) => {
      return workspacesResult.data.filter((w) => w.issue_id === issueId);
    },
    [workspacesResult.data]
  );

  const value = useMemo<UserContextValue>(
    () => ({
      // Data
      workspaces: workspacesResult.data,

      // Loading/error
      isLoading: workspacesResult.isLoading,
      error: workspacesResult.error,
      retry: workspacesResult.retry,

      // Lookup helpers
      getWorkspacesForIssue,
    }),
    [workspacesResult, getWorkspacesForIssue]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/**
 * Hook to access user context.
 * Must be used within a UserProvider.
 */
export function useUserContext(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}
