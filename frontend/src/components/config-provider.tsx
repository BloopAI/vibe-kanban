import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Config } from 'shared/types';
import { configApi, githubAuthApi } from '../lib/api';

interface ConfigContextType {
  config: Config | null;
  updateConfig: (updates: Partial<Config>) => void;
  updateAndSaveConfig: (updates: Partial<Config>) => void;
  saveConfig: () => Promise<boolean>;
  loading: boolean;
  githubTokenInvalid: boolean;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubTokenInvalid, setGithubTokenInvalid] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await configApi.getConfig();
        setConfig(config);
      } catch (err) {
        console.error('Error loading config:', err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
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
      setGithubTokenInvalid(!valid);
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
    async (updates: Partial<Config>) => {
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

  return (
    <ConfigContext.Provider
      value={{
        config,
        updateConfig,
        saveConfig,
        loading,
        updateAndSaveConfig,
        githubTokenInvalid,
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
