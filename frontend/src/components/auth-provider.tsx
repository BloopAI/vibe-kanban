import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// User interface for the auth context (will be synced with backend types later)
interface User {
  id: string;
  github_id: number;
  username: string;
  email: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

// JWT token management
const JWT_TOKEN_KEY = 'automagik_auth_token';

const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
};

const setStoredToken = (token: string): void => {
  try {
    localStorage.setItem(JWT_TOKEN_KEY, token);
  } catch (error) {
    console.error('Failed to store auth token:', error);
  }
};

const removeStoredToken = (): void => {
  try {
    localStorage.removeItem(JWT_TOKEN_KEY);
  } catch (error) {
    console.error('Failed to remove auth token:', error);
  }
};

// Helper to parse JWT payload (basic implementation for user info)
const parseJWT = (token: string): User | null => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    
    // Extract user information from JWT payload
    if (payload.sub && payload.github_id && payload.username && payload.email) {
      return {
        id: payload.sub,
        github_id: payload.github_id,
        username: payload.username,
        email: payload.email,
        created_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : new Date().toISOString(),
      };
    }
    return null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state from stored token
  useEffect(() => {
    const initializeAuth = () => {
      const token = getStoredToken();
      if (token) {
        const parsedUser = parseJWT(token);
        if (parsedUser) {
          setUser(parsedUser);
        } else {
          // Invalid token, remove it
          removeStoredToken();
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = useCallback((token: string) => {
    const parsedUser = parseJWT(token);
    if (parsedUser) {
      setStoredToken(token);
      setUser(parsedUser);
    } else {
      console.error('Invalid JWT token provided to login');
    }
  }, []);

  const logout = useCallback(() => {
    removeStoredToken();
    setUser(null);
  }, []);

  const setUserCallback = useCallback((newUser: User | null) => {
    setUser(newUser);
  }, []);

  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        setUser: setUserCallback,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook to get auth token for API requests
export function useAuthToken(): string | null {
  return getStoredToken();
}