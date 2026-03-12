import { ReactNode, useMemo } from 'react';
import { UserSystemContext } from '@/shared/hooks/useUserSystem';
import { useUserSystemController } from '@/shared/hooks/useUserSystemController';
import { useSettingsMachineClient } from './SettingsHostContext';

export function SettingsMachineUserSystemProvider({
  children,
}: {
  children: ReactNode;
}) {
  const machineClient = useSettingsMachineClient();
  const queryKey = useMemo(
    () =>
      [
        'user-system',
        'settings-machine',
        machineClient?.target.id ?? 'unselected',
      ] as const,
    [machineClient]
  );

  const { value } = useUserSystemController({
    queryKey,
    enabled: machineClient != null,
    load: () => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.getConfig();
    },
    save: (config) => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.saveConfig(config);
    },
  });

  return (
    <UserSystemContext.Provider value={value}>
      {children}
    </UserSystemContext.Provider>
  );
}
