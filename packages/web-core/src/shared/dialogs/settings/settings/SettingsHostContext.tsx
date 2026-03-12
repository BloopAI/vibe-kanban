import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { listRelayHosts } from '@/shared/lib/remoteApi';
import { useAppRuntime, type AppRuntime } from '@/shared/hooks/useAppRuntime';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useHostId } from '@/shared/providers/HostIdProvider';
import {
  createMachineClient,
  type MachineClient,
  type MachineTarget,
} from '@/shared/lib/machineClient';
import {
  useRemoteCloudHostsState,
  type RemoteCloudHost,
} from '@/shared/hooks/useRemoteCloudHosts';
import { listPairedRelayHosts } from '@/shared/lib/relayPairingStorage';

export type SettingsHostTargetId = 'local' | string;

export type SettingsHostTarget = MachineTarget & {
  description?: string;
  status?: 'online' | 'offline';
};

interface SettingsHostContextValue {
  availableHosts: SettingsHostTarget[];
  hostsResolved: boolean;
  selectedHostId: SettingsHostTargetId | null;
  selectedHost: SettingsHostTarget | null;
  setSelectedHostId: (hostId: SettingsHostTargetId) => void;
}

const SettingsHostContext = createContext<SettingsHostContextValue | null>(
  null
);

function toLocalRuntimeTargets(
  remoteHosts: RemoteCloudHost[],
  getLabel: (key: string, defaultValue: string) => string
): SettingsHostTarget[] {
  return [
    {
      id: 'local',
      apiHostId: null,
      label: getLabel('settings.hostPicker.thisMachine', 'This machine'),
      description: getLabel('settings.hostPicker.localHost', 'Local host'),
      kind: 'local',
    },
    ...remoteHosts.map((host) => ({
      id: host.id,
      apiHostId: host.id,
      label: host.name,
      description: getLabel('settings.hostPicker.remoteHost', 'Remote host'),
      status:
        host.status === 'online' ? ('online' as const) : ('offline' as const),
      kind: 'remote' as const,
    })),
  ];
}

function getInitialHostId(
  hosts: SettingsHostTarget[],
  runtime: AppRuntime,
  routeHostId: string | null,
  initialHostId?: SettingsHostTargetId
): SettingsHostTargetId | null {
  if (initialHostId && hosts.some((host) => host.id === initialHostId)) {
    return initialHostId;
  }

  if (routeHostId && hosts.some((host) => host.id === routeHostId)) {
    return routeHostId;
  }

  if (runtime === 'local') {
    return (
      hosts.find((host) => host.id === 'local')?.id ?? hosts[0]?.id ?? null
    );
  }

  return (
    hosts.find((host) => host.status === 'online')?.id ?? hosts[0]?.id ?? null
  );
}

export function SettingsHostProvider({
  initialHostId,
  children,
}: {
  initialHostId?: SettingsHostTargetId;
  children: ReactNode;
}) {
  const { t } = useTranslation('settings');
  const runtime = useAppRuntime();
  const routeHostId = useHostId();
  const { isSignedIn } = useAuth();
  const { data: localRemoteHosts } = useRemoteCloudHostsState();
  const { data: relayHosts = [], isLoading: relayHostsLoading } = useQuery({
    queryKey: ['settings-dialog', 'relay-hosts'],
    queryFn: listRelayHosts,
    enabled: runtime === 'remote' && isSignedIn,
    staleTime: 30_000,
  });
  const { data: pairedRelayHosts = [], isLoading: pairedRelayHostsLoading } =
    useQuery({
      queryKey: ['settings-dialog', 'paired-relay-hosts'],
      queryFn: async () => {
        try {
          return await listPairedRelayHosts();
        } catch {
          return [];
        }
      },
      enabled: runtime === 'remote' && isSignedIn,
      staleTime: 5_000,
    });
  const hostsResolved = useMemo(() => {
    if (runtime === 'local') {
      return true;
    }

    if (!isSignedIn) {
      return true;
    }

    return !relayHostsLoading && !pairedRelayHostsLoading;
  }, [isSignedIn, pairedRelayHostsLoading, relayHostsLoading, runtime]);

  const availableHosts = useMemo<SettingsHostTarget[]>(() => {
    if (runtime === 'local') {
      return toLocalRuntimeTargets(localRemoteHosts?.hosts ?? [], t);
    }

    const pairedHostIds = new Set(pairedRelayHosts.map((host) => host.host_id));
    return relayHosts
      .filter((host) => pairedHostIds.has(host.id))
      .map((host) => ({
        id: host.id,
        apiHostId: host.id,
        label: host.name,
        description: t('settings.hostPicker.remoteHost', 'Remote host'),
        status:
          host.status === 'online' ? ('online' as const) : ('offline' as const),
        kind: 'remote',
      }));
  }, [localRemoteHosts?.hosts, pairedRelayHosts, relayHosts, runtime, t]);

  const [selectedHostId, setSelectedHostId] =
    useState<SettingsHostTargetId | null>(null);

  useEffect(() => {
    const nextHostId = getInitialHostId(
      availableHosts,
      runtime,
      routeHostId,
      initialHostId
    );

    setSelectedHostId((current) => {
      if (current && availableHosts.some((host) => host.id === current)) {
        return current;
      }
      return nextHostId;
    });
  }, [availableHosts, initialHostId, routeHostId, runtime]);

  const selectedHost = useMemo(
    () => availableHosts.find((host) => host.id === selectedHostId) ?? null,
    [availableHosts, selectedHostId]
  );

  const value = useMemo<SettingsHostContextValue>(
    () => ({
      availableHosts,
      hostsResolved,
      selectedHostId,
      selectedHost,
      setSelectedHostId,
    }),
    [availableHosts, hostsResolved, selectedHost, selectedHostId]
  );

  return (
    <SettingsHostContext.Provider value={value}>
      {children}
    </SettingsHostContext.Provider>
  );
}

export function useSettingsHost() {
  const context = useContext(SettingsHostContext);
  if (!context) {
    throw new Error(
      'useSettingsHost must be used within a SettingsHostProvider'
    );
  }
  return context;
}

export function useSettingsMachineClient(): MachineClient | null {
  const runtime = useAppRuntime();
  const { selectedHost } = useSettingsHost();

  return useMemo(() => {
    if (!selectedHost) {
      return null;
    }

    return createMachineClient(runtime, selectedHost);
  }, [runtime, selectedHost]);
}
