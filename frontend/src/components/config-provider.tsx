import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  type Config,
  type Environment,
  type ProfileConfig,
  type UserSystemInfo,
  CheckTokenResponse,
} from 'shared/types';
import { configApi, githubAuthApi } from '../lib/api';

interface UserSystemState {
  config: Config | null;
  environment: Environment | null;
  profiles: ProfileConfig[] | null;
}

interface UserSystemContextType {
  // Full system state
  system: UserSystemState;

  // Hot path - config helpers (most frequently used)
  config: Config | null;
  updateConfig: (updates: Partial<Config>) => void;
  updateAndSaveConfig: (updates: Partial<Config>) => Promise<boolean>;
  saveConfig: () => Promise<boolean>;

  // System data access
  environment: Environment | null;
  profiles: ProfileConfig[] | null;
  setEnvironment: (env: Environment | null) => void;
  setProfiles: (profiles: ProfileConfig[] | null) => void;

  // Reload system data
  reloadSystem: () => Promise<void>;

  // State
  loading: boolean;
  githubTokenInvalid: boolean;
}

const UserSystemContext = createContext<UserSystemContextType | undefined>(
  undefined
);

interface UserSystemProviderProps {
  children: ReactNode;
}

export function UserSystemProvider({ children }: UserSystemProviderProps) {
  // Split state for performance - independent re-renders
  const [config, setConfig] = useState<Config | null>(null);
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [profiles, setProfiles] = useState<ProfileConfig[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubTokenInvalid, setGithubTokenInvalid] = useState(false);

  useEffect(() => {
    const loadUserSystem = async () => {
      try {
        const userSystemInfo: UserSystemInfo = await configApi.getConfig();
        setConfig(userSystemInfo.config);
        setEnvironment(userSystemInfo.environment);
        setProfiles(userSystemInfo.profiles);
      } catch (err) {
        console.error('Error loading user system:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUserSystem();
  }, []);

  // Check GitHub token validity after config loads
  useEffect(() => {
    if (loading) return;
    const checkToken = async () => {
      const valid = await githubAuthApi.checkGithubToken();
      if (valid === undefined) {
        // Network/server error: do not update githubTokenInvalid
        return;
      }
      switch (valid) {
        case CheckTokenResponse.VALID:
          setGithubTokenInvalid(false);
          break;
        case CheckTokenResponse.INVALID:
          setGithubTokenInvalid(true);
          break;
      }
    };
    checkToken();
  }, [loading]);

  const updateConfig = useCallback((updates: Partial<Config>) => {
    setConfig((prev) => (prev ? { ...prev, ...updates } : null));
  }, []);

  const saveConfig = useCallback(async (): Promise<boolean> => {
    if (!config) return false;
    try {
      await configApi.saveConfig(config);
      return true;
    } catch (err) {
      console.error('Error saving config:', err);
      return false;
    }
  }, [config]);

  const updateAndSaveConfig = useCallback(
    async (updates: Partial<Config>): Promise<boolean> => {
      setLoading(true);
      const newConfig: Config | null = config
        ? { ...config, ...updates }
        : null;
      try {
        if (!newConfig) return false;
        const saved = await configApi.saveConfig(newConfig);
        setConfig(saved);
        return true;
      } catch (err) {
        console.error('Error saving config:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [config]
  );

  const reloadSystem = useCallback(async () => {
    setLoading(true);
    try {
      const userSystemInfo: UserSystemInfo = await configApi.getConfig();
      setConfig(userSystemInfo.config);
      setEnvironment(userSystemInfo.environment);
      setProfiles(userSystemInfo.profiles);
    } catch (err) {
      console.error('Error reloading user system:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<UserSystemContextType>(
    () => ({
      system: { config, environment, profiles },
      config,
      environment,
      profiles,
      updateConfig,
      saveConfig,
      updateAndSaveConfig,
      setEnvironment,
      setProfiles,
      reloadSystem,
      loading,
      githubTokenInvalid,
    }),
    [
      config,
      environment,
      profiles,
      updateConfig,
      saveConfig,
      updateAndSaveConfig,
      reloadSystem,
      loading,
      githubTokenInvalid,
    ]
  );

  return (
    <UserSystemContext.Provider value={value}>
      {children}
    </UserSystemContext.Provider>
  );
}

export function useUserSystem() {
  const context = useContext(UserSystemContext);
  if (context === undefined) {
    throw new Error('useUserSystem must be used within a UserSystemProvider');
  }
  return context;
}

// TODO: delete
// Backward compatibility hook - maintains existing API
export function useConfig() {
  const {
    config,
    updateConfig,
    saveConfig,
    updateAndSaveConfig,
    loading,
    githubTokenInvalid,
  } = useUserSystem();
  return {
    config,
    updateConfig,
    saveConfig,
    updateAndSaveConfig,
    loading,
    githubTokenInvalid,
  };
}

// TODO: delete
// Backward compatibility export - allows gradual migration
export const ConfigProvider = UserSystemProvider;
