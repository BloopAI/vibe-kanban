import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { ApiResponse, Config } from 'shared/types';

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
        const response = await fetch('/api/config');
        const data: ApiResponse<Config> = await response.json();

        if (data.success && data.data) {
          setConfig(data.data);
        }
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
      try {
        const response = await fetch('/api/auth/github/check');
        const data: ApiResponse<null> = await response.json();
        if (!data.success && data.message === 'github_token_invalid') {
          setGithubTokenInvalid(true);
        } else {
          setGithubTokenInvalid(false);
        }
      } catch (err) {
        // If the check fails, assume token is invalid
        setGithubTokenInvalid(true);
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
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      const data: ApiResponse<Config> = await response.json();
      return data.success;
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
        const response = await fetch('/api/config', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newConfig),
        });

        const data: ApiResponse<Config> = await response.json();
        setConfig(data.data);
        return data.success;
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
