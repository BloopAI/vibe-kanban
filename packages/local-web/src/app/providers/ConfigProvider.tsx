import { ReactNode, useCallback, useEffect } from 'react';
import { configApi } from '@/shared/lib/api';
import { updateLanguageFromConfig } from '@/i18n/config';
import { setRemoteApiBase } from '@/shared/lib/remoteApi';
import { useUserSystemController } from '@/shared/hooks/useUserSystemController';
import { UserSystemContext } from '@/shared/hooks/useUserSystem';
import { tokenManager } from '@/shared/lib/auth/tokenManager';

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

  const isLocalOnlySession =
    userSystemInfo?.login_status?.status === 'loggedin' &&
    userSystemInfo.login_status.profile == null;

  // Set runtime remote API base URL for self-hosting support.
  // In local-only mode there is no usable remote auth/session, so force
  // collections to skip Electric and use local fallback routes directly.
  // Must run during render (not in useEffect) so it's set before children
  // mount.
  setRemoteApiBase(
    isLocalOnlySession ? null : (userSystemInfo?.shared_api_base ?? null)
  );

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
    <UserSystemContext.Provider value={value}>
      {children}
    </UserSystemContext.Provider>
  );
}
