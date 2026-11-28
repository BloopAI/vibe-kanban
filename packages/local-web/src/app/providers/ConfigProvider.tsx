import { ReactNode, useCallback, useEffect, useMemo } from 'react';
import { configApi } from '@/shared/lib/api';
import { updateLanguageFromConfig } from '@/i18n/config';
import { setRemoteApiBase } from '@/shared/lib/remoteApi';
import { setRelayApiBase } from '@/shared/lib/relayBackendApi';
import {
  CloudAvailabilityProvider,
  getCloudAvailability,
} from '@/shared/hooks/useCloudAvailability';
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

  // Set runtime remote API base URL for self-hosting support.
  // Must run during render (not in useEffect) so it's set before children mount.
  setRemoteApiBase(userSystemInfo?.shared_api_base);
  setRelayApiBase(userSystemInfo?.shared_relay_api_base);

  const sharedApiBase = userSystemInfo?.shared_api_base;
  const sharedRelayApiBase = userSystemInfo?.shared_relay_api_base;
  const cloudAvailability = useMemo(
    () =>
      getCloudAvailability({
        shared_api_base: sharedApiBase,
        shared_relay_api_base: sharedRelayApiBase,
      }),
    [sharedApiBase, sharedRelayApiBase]
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
    <CloudAvailabilityProvider value={cloudAvailability}>
      <UserSystemContext.Provider value={value}>
        {children}
      </UserSystemContext.Provider>
    </CloudAvailabilityProvider>
  );
}
