import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppBarHost, AppBarHostStatus } from '@vibe/ui/components/AppBar';
import type { PairRelayHostRequest, RelayPairedHost } from 'shared/types';
import type { RelayHost } from 'shared/remote-types';
import { relayApi } from '@/shared/lib/api';
import { listRelayHosts } from '@/shared/lib/remoteApi';

export type RemoteCloudHostStatus = AppBarHostStatus;

export interface RemoteCloudHost {
  id: string;
  name: string;
  status: RemoteCloudHostStatus;
  pairedAt: string;
  lastUsedAt: string;
}

interface RemoteCloudHostsState {
  hosts: RemoteCloudHost[];
  activeHostId: string | null;
}

const ACTIVE_HOST_STORAGE_KEY = 'vk-remote-cloud-active-host-id';

export const REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY = [
  'remote-cloud-hosts',
  'state',
] as const;

function readActiveHostId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(ACTIVE_HOST_STORAGE_KEY);
}

function writeActiveHostId(hostId: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (!hostId) {
    window.localStorage.removeItem(ACTIVE_HOST_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(ACTIVE_HOST_STORAGE_KEY, hostId);
}

function normalizeRemoteCloudHostStatus(
  status: RelayHost['status'] | undefined
): RemoteCloudHostStatus {
  if (status === 'online' || status === 'offline' || status === 'unpaired') {
    return status;
  }

  return 'offline';
}

async function fetchRemoteCloudHostsState(): Promise<RemoteCloudHostsState> {
  let pairedHosts: RelayPairedHost[] = [];
  try {
    pairedHosts = await relayApi.listPairedRelayHosts();
  } catch {
    return { hosts: [], activeHostId: null };
  }

  let remoteHosts: RelayHost[] = [];
  try {
    remoteHosts = await listRelayHosts();
  } catch {
    remoteHosts = [];
  }

  const remoteHostsById = new Map(remoteHosts.map((host) => [host.id, host]));

  const hosts = pairedHosts
    .map((host) => {
      const remoteHost = remoteHostsById.get(host.host_id);
      const status = normalizeRemoteCloudHostStatus(remoteHost?.status);
      const pairedAt = host.paired_at ?? '';

      return {
        id: host.host_id,
        name: remoteHost?.name ?? host.host_name ?? host.host_id,
        status,
        pairedAt,
        lastUsedAt: pairedAt,
      };
    })
    .sort((a, b) => b.pairedAt.localeCompare(a.pairedAt));

  const storedActiveHostId = readActiveHostId();
  const activeHostId =
    storedActiveHostId && hosts.some((host) => host.id === storedActiveHostId)
      ? storedActiveHostId
      : (hosts[0]?.id ?? null);

  if (activeHostId !== storedActiveHostId) {
    writeActiveHostId(activeHostId);
  }

  return { hosts, activeHostId };
}

export function useRemoteCloudHostsState() {
  return useQuery({
    queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
    queryFn: fetchRemoteCloudHostsState,
    staleTime: 0,
  });
}

export function usePairRemoteCloudHostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: PairRelayHostRequest) =>
      relayApi.pairRelayHost(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
      });
    },
  });
}

export function useRemoveRemoteCloudHostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (hostId: string) => relayApi.removePairedRelayHost(hostId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
      });
    },
  });
}

export function useSetActiveRemoteCloudHostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (hostId: string) => {
      writeActiveHostId(hostId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
      });
    },
  });
}

export function useRemoteCloudHostsAppBarModel(): {
  hosts: AppBarHost[];
  activeHostId: string | null;
  remoteHosts: RemoteCloudHost[];
} {
  const { data } = useRemoteCloudHostsState();

  const remoteHosts = data?.hosts ?? [];
  const activeHostId = data?.activeHostId ?? null;

  const hosts = useMemo<AppBarHost[]>(
    () =>
      remoteHosts.map((host) => ({
        id: host.id,
        name: host.name,
        status: host.status,
      })),
    [remoteHosts]
  );

  return {
    hosts,
    activeHostId,
    remoteHosts,
  };
}
