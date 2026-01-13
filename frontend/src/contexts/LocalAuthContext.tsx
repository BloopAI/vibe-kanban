import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LocalAuthUser,
  LocalAuthStatusResponse,
  LocalAuthInitResponse,
} from '@/lib/api';

// Constants for localStorage keys
const AUTH_TOKEN_KEY = 'vk_auth_token';
const USER_KEY = 'vk_user';

// Auth context state
interface LocalAuthContextType {
  user: LocalAuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLocalAuthConfigured: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const LocalAuthContext = createContext<LocalAuthContextType | undefined>(
  undefined
);

// API functions for local auth
const localAuthApi = {
  getStatus: async (token: string | null): Promise<LocalAuthStatusResponse> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch('/api/local-auth/status', { headers });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to get auth status');
    }
    return result.data;
  },

  initGitHubAuth: async (): Promise<LocalAuthInitResponse> => {
    const response = await fetch('/api/local-auth/github');
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to init GitHub auth');
    }
    return result.data;
  },

  logout: async (token: string): Promise<void> => {
    await fetch('/api/local-auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  },

  getMe: async (token: string): Promise<LocalAuthUser> => {
    const response = await fetch('/api/local-auth/me', {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json();
    if (!result.success) {
      throw new Error(result.message || 'Failed to get user');
    }
    return result.data;
  },
};

// Get initial token and user from localStorage
function getInitialState(): {
  token: string | null;
  user: LocalAuthUser | null;
} {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userJson = localStorage.getItem(USER_KEY);
  let user: LocalAuthUser | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      localStorage.removeItem(USER_KEY);
    }
  }

  return { token, user };
}

interface LocalAuthProviderProps {
  children: ReactNode;
}

export function LocalAuthProvider({ children }: LocalAuthProviderProps) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(
    () => getInitialState().token
  );
  const [isLocalAuthConfigured, setIsLocalAuthConfigured] = useState(true);

  // Query to validate and refresh auth status
  const {
    data: authStatus,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['local-auth-status', token],
    queryFn: () => localAuthApi.getStatus(token),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Update localStorage when auth status changes
  useEffect(() => {
    if (authStatus?.authenticated && authStatus.user) {
      localStorage.setItem(USER_KEY, JSON.stringify(authStatus.user));
    } else if (authStatus && !authStatus.authenticated) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null);
    }
  }, [authStatus]);

  // Listen for auth success messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'AUTH_SUCCESS' && event.data?.token) {
        setToken(event.data.token);
        queryClient.invalidateQueries({ queryKey: ['local-auth-status'] });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient]);

  // Check localStorage on mount/focus for changes from popup
  useEffect(() => {
    const checkAuth = () => {
      const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (storedToken && storedToken !== token) {
        setToken(storedToken);
        queryClient.invalidateQueries({ queryKey: ['local-auth-status'] });
      }
    };

    // Check on focus (in case user logged in from another tab/popup)
    window.addEventListener('focus', checkAuth);
    return () => window.removeEventListener('focus', checkAuth);
  }, [token, queryClient]);

  const login = useCallback(async () => {
    try {
      const { authorize_url } = await localAuthApi.initGitHubAuth();

      // Open GitHub OAuth in popup
      const width = 500;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      window.open(
        authorize_url,
        'github-oauth',
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );
    } catch (error) {
      console.error('Failed to initiate login:', error);
      // If we get an error about not configured, mark as not configured
      if (error instanceof Error && error.message.includes('not configured')) {
        setIsLocalAuthConfigured(false);
      }
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await localAuthApi.logout(token);
      } catch (error) {
        console.error('Logout API error:', error);
      }
    }

    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    queryClient.invalidateQueries({ queryKey: ['local-auth-status'] });
  }, [token, queryClient]);

  const refreshAuth = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo<LocalAuthContextType>(
    () => ({
      user: authStatus?.user ?? null,
      token,
      isAuthenticated: authStatus?.authenticated ?? false,
      isLoading,
      isLocalAuthConfigured,
      login,
      logout,
      refreshAuth,
    }),
    [
      authStatus,
      token,
      isLoading,
      isLocalAuthConfigured,
      login,
      logout,
      refreshAuth,
    ]
  );

  return (
    <LocalAuthContext.Provider value={value}>
      {children}
    </LocalAuthContext.Provider>
  );
}

export function useLocalAuth() {
  const context = useContext(LocalAuthContext);
  if (context === undefined) {
    throw new Error('useLocalAuth must be used within a LocalAuthProvider');
  }
  return context;
}

// Helper hook to get the auth token for API calls
export function useAuthToken(): string | null {
  const context = useContext(LocalAuthContext);
  return context?.token ?? null;
}
