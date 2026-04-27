import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import type { Config, LoginStatus } from 'shared/types';
import { configApi } from '@/shared/lib/api';
import { updateLanguageFromConfig } from '@/i18n/config';
import {
  setLocalRemoteApiEnabled,
  setRemoteApiBase,
} from '@/shared/lib/remoteApi';
import { useUserSystemController } from '@/shared/hooks/useUserSystemController';
import { UserSystemContext } from '@/shared/hooks/useUserSystem';
import { tokenManager } from '@/shared/lib/auth/tokenManager';
import { LOCAL_USER_ID } from '@/shared/lib/localIdentity';

interface UserSystemProviderProps {
  children: ReactNode;
}

export function UserSystemProvider({ children }: UserSystemProviderProps) {
  const loadConfig = useCallback(() => configApi.getConfig(null), []);
  const saveConfig = useCallback(
    (config: Parameters<typeof configApi.saveConfig>[0]) =>
      configApi.saveConfig(config, null),
    []
  );

  const { value, userSystemInfo } = useUserSystemController({
    queryKey: ['user-system', 'local'],
    load: loadConfig,
    save: saveConfig,
  });
  const { updateConfig, updateAndSaveConfig } = value;

  const localMode = !userSystemInfo?.shared_api_base;
  const localLoginStatus = useMemo<LoginStatus>(
    () => ({
      status: 'loggedin',
      profile: {
        user_id: LOCAL_USER_ID,
        username: 'local',
        email: 'local@vibe-kanban.local',
        providers: [
          {
            provider: 'local',
            username: 'local',
            display_name: 'Local User',
            email: 'local@vibe-kanban.local',
            avatar_url: null,
          },
        ],
      },
    }),
    []
  );
  const localConfig = useMemo<Config | null>(
    () =>
      localMode && value.config
        ? {
            ...value.config,
            remote_onboarding_acknowledged: true,
            onboarding_acknowledged: true,
            disclaimer_acknowledged: true,
          }
        : value.config,
    [localMode, value.config]
  );
  const localUpdateConfig = useCallback(
    (updates: Partial<Config>) =>
      updateConfig(
        localMode
          ? {
              ...updates,
              remote_onboarding_acknowledged: true,
              onboarding_acknowledged: true,
              disclaimer_acknowledged: true,
            }
          : updates
      ),
    [localMode, updateConfig]
  );
  const localUpdateAndSaveConfig = useCallback(
    (updates: Partial<Config>) =>
      updateAndSaveConfig(
        localMode
          ? {
              ...updates,
              remote_onboarding_acknowledged: true,
              onboarding_acknowledged: true,
              disclaimer_acknowledged: true,
            }
          : updates
      ),
    [localMode, updateAndSaveConfig]
  );
  const contextValue = useMemo(
    () =>
      localMode
        ? {
            ...value,
            config: localConfig,
            updateConfig: localUpdateConfig,
            updateAndSaveConfig: localUpdateAndSaveConfig,
            system: {
              ...value.system,
              config: localConfig,
              loginStatus: localLoginStatus,
              remoteAuthDegraded: null,
            },
            loginStatus: localLoginStatus,
            remoteAuthDegraded: null,
          }
        : value,
    [
      localConfig,
      localLoginStatus,
      localMode,
      localUpdateAndSaveConfig,
      localUpdateConfig,
      value,
    ]
  );

  // Set runtime remote API base URL for self-hosting support.
  // This runs during render so children see it before they mount.
  setLocalRemoteApiEnabled(true);
  setRemoteApiBase(userSystemInfo?.shared_api_base);

  // Sync language with i18n when config changes
  useEffect(() => {
    if (value.config?.language) {
      updateLanguageFromConfig(value.config.language);
    }
  }, [value.config?.language]);

  useEffect(() => {
    tokenManager.syncRecoveryState();
  }, [value.loginStatus?.status, value.remoteAuthDegraded]);

  return (
    <UserSystemContext.Provider value={contextValue}>
      {children}
    </UserSystemContext.Provider>
  );
}
