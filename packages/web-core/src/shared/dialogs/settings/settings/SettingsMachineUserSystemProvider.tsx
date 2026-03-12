import { ReactNode, useCallback, useMemo } from 'react';
import { UserSystemContext } from '@/shared/hooks/useUserSystem';
import { useUserSystemController } from '@/shared/hooks/useUserSystemController';
import { useSettingsMachineClient } from './SettingsHostContext';

export function SettingsMachineUserSystemProvider({
  children,
}: {
  children: ReactNode;
}) {
  const machineClient = useSettingsMachineClient();
  const queryKey = useMemo(() => {
    if (machineClient?.target.kind === 'local') {
      return ['user-system', 'local'] as const;
    }

    return [
      'user-system',
      'settings-machine',
      machineClient?.target.id ?? 'unselected',
    ] as const;
  }, [machineClient]);
  const loadConfig = useCallback(() => {
    if (!machineClient) {
      throw new Error('Machine client is required');
    }

    return machineClient.getConfig();
  }, [machineClient]);
  const saveConfig = useCallback(
    (
      config: Parameters<NonNullable<typeof machineClient>['saveConfig']>[0]
    ) => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.saveConfig(config);
    },
    [machineClient]
  );

  const { value } = useUserSystemController({
    queryKey,
    enabled: machineClient != null,
    load: loadConfig,
    save: saveConfig,
  });

  return (
    <UserSystemContext.Provider value={value}>
      {children}
    </UserSystemContext.Provider>
  );
}
