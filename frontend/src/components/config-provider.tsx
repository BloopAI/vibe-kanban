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
  type UserSystemInfo,
  type BaseAgentCapability,
  type LoginStatus,
} from 'shared/types';
import type { ExecutorConfig } from 'shared/types';
import { configApi } from '../lib/api';
import { updateLanguageFromConfig } from '../i18n/config';

interface UserSystemState {
  config: Config | null;
  environment: Environment | null;
  profiles: Record<string, ExecutorConfig> | null;
  capabilities: Record<string, BaseAgentCapability[]> | null;
  analyticsUserId: string | null;
  loginStatus: LoginStatus | null;
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
  profiles: Record<string, ExecutorConfig> | null;
  capabilities: Record<string, BaseAgentCapability[]> | null;
  analyticsUserId: string | null;
  loginStatus: LoginStatus | null;
  setEnvironment: (env: Environment | null) => void;
  setProfiles: (profiles: Record<string, ExecutorConfig> | null) => void;
  setCapabilities: (caps: Record<string, BaseAgentCapability[]> | null) => void;

  // Reload system data
  reloadSystem: () => Promise<void>;

  // State
  loading: boolean;
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
  const [profiles, setProfiles] = useState<Record<
    string,
    ExecutorConfig
  > | null>(null);
  const [capabilities, setCapabilities] = useState<Record<
    string,
    BaseAgentCapability[]
  > | null>(null);
  const [analyticsUserId, setAnalyticsUserId] = useState<string | null>(null);
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserSystem = async () => {
      try {
        const userSystemInfo: UserSystemInfo = await configApi.getConfig();
        setConfig(userSystemInfo.config);
        setEnvironment(userSystemInfo.environment);
        setAnalyticsUserId(userSystemInfo.analytics_user_id);
        setLoginStatus(userSystemInfo.login_status);
        setProfiles(
          userSystemInfo.executors as Record<string, ExecutorConfig> | null
        );
        setCapabilities(
          (userSystemInfo.capabilities || null) as Record<
            string,
            BaseAgentCapability[]
          > | null
        );
      } catch (err) {
        console.error('Error loading user system:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUserSystem();
  }, []);

  // Sync language with i18n when config changes
  useEffect(() => {
    if (config?.language) {
      updateLanguageFromConfig(config.language);
    }
  }, [config?.language]);

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
      setAnalyticsUserId(userSystemInfo.analytics_user_id);
      setLoginStatus(userSystemInfo.login_status);
      setProfiles(
        userSystemInfo.executors as Record<string, ExecutorConfig> | null
      );
      setCapabilities(
        (userSystemInfo.capabilities || null) as Record<
          string,
          BaseAgentCapability[]
        > | null
      );
    } catch (err) {
      console.error('Error reloading user system:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const value = useMemo<UserSystemContextType>(
    () => ({
      system: {
        config,
        environment,
        profiles,
        capabilities,
        analyticsUserId,
        loginStatus,
      },
      config,
      environment,
      profiles,
      capabilities,
      analyticsUserId,
      loginStatus,
      updateConfig,
      saveConfig,
      updateAndSaveConfig,
      setEnvironment,
      setProfiles,
      setCapabilities,
      reloadSystem,
      loading,
    }),
    [
      config,
      environment,
      profiles,
      capabilities,
      analyticsUserId,
      loginStatus,
      updateConfig,
      saveConfig,
      updateAndSaveConfig,
      reloadSystem,
      loading,
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
