import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// Placeholder user interface - will be replaced by actual shared types
interface User {
  id: string;
  username: string;
  email: string;
  github_id?: number;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize auth state on app load
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          // TODO: Validate token and fetch user info from backend
          // For now, we'll just set loading to false
          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error);
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (token: string) => {
    try {
      // Store the token
      localStorage.setItem('auth_token', token);
      
      // TODO: Fetch user info from backend using the token
      // const userResponse = await authApi.getUser();
      // setUser(userResponse);
      
      // For now, set a mock user
      // setUser(mockUser);
    } catch (error) {
      console.error('Login failed:', error);
      localStorage.removeItem('auth_token');
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
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