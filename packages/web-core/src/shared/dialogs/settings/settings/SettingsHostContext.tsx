import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { listRelayHosts } from '@/shared/lib/remoteApi';
import { useAppRuntime, type AppRuntime } from '@/shared/hooks/useAppRuntime';
import { useAuth } from '@/shared/hooks/auth/useAuth';
import { useHostId } from '@/shared/providers/HostIdProvider';
import {
  useRemoteCloudHostsState,
  type RemoteCloudHost,
} from '@/shared/hooks/useRemoteCloudHosts';
import { listPairedRelayHosts } from '@/shared/lib/relayPairingStorage';

export type SettingsHostTargetId = 'local' | string;

export interface SettingsHostTarget {
  id: SettingsHostTargetId;
  apiHostId: string | null;
  label: string;
  description?: string;
  status?: 'online' | 'offline';
  kind: 'local' | 'remote';
}

interface SettingsHostContextValue {
  availableHosts: SettingsHostTarget[];
  selectedHostId: SettingsHostTargetId | null;
  selectedHost: SettingsHostTarget | null;
  setSelectedHostId: (hostId: SettingsHostTargetId) => void;
}

const SettingsHostContext = createContext<SettingsHostContextValue | null>(
  null
);

function toLocalRuntimeTargets(
  remoteHosts: RemoteCloudHost[]
): SettingsHostTarget[] {
  return [
    {
      id: 'local',
      apiHostId: null,
      label: 'This machine',
      description: 'Local host',
      kind: 'local',
    },
    ...remoteHosts.map((host) => ({
      id: host.id,
      apiHostId: host.id,
      label: host.name,
      description: 'Remote host',
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
  const runtime = useAppRuntime();
  const routeHostId = useHostId();
  const { isSignedIn } = useAuth();
  const { data: localRemoteHosts } = useRemoteCloudHostsState();
  const { data: relayHosts = [] } = useQuery({
    queryKey: ['settings-dialog', 'relay-hosts'],
    queryFn: listRelayHosts,
    enabled: runtime === 'remote' && isSignedIn,
    staleTime: 30_000,
  });
  const { data: pairedRelayHosts = [] } = useQuery({
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

  const availableHosts = useMemo<SettingsHostTarget[]>(() => {
    if (runtime === 'local') {
      return toLocalRuntimeTargets(localRemoteHosts?.hosts ?? []);
    }

    const pairedHostIds = new Set(pairedRelayHosts.map((host) => host.host_id));
    return relayHosts
      .filter((host) => pairedHostIds.has(host.id))
      .map((host) => ({
        id: host.id,
        apiHostId: host.id,
        label: host.name,
        description: 'Remote host',
        status:
          host.status === 'online' ? ('online' as const) : ('offline' as const),
        kind: 'remote',
      }));
  }, [localRemoteHosts?.hosts, pairedRelayHosts, relayHosts, runtime]);

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
      selectedHostId,
      selectedHost,
      setSelectedHostId,
    }),
    [availableHosts, selectedHost, selectedHostId]
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
