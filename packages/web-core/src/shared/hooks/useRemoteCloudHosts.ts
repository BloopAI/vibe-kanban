import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppBarHost, AppBarHostStatus } from '@vibe/ui/components/AppBar';
import type { RelayPairedHost } from 'shared/types';
import type { RelayHost } from 'shared/remote-types';
import { relayApi, type PairRelayHostRequest } from '@/shared/lib/api';
import { getRemoteApiUrl, listRelayHosts } from '@/shared/lib/remoteApi';

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
}

export const REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY = [
  'remote-cloud-hosts',
  'state',
] as const;

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
    return { hosts: [] };
  }

  let remoteHosts: RelayHost[] = [];
  // Only call the remote API when a cloud URL is actually configured.
  // Without it, getToken() would hit /api/auth/token, get a 400, and React
  // Query would surface that as an unhandled error that blocks the UI.
  if (getRemoteApiUrl()) {
    try {
      remoteHosts = await listRelayHosts();
    } catch {
      remoteHosts = [];
    }
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

  return { hosts };
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

export function useRemoteCloudHostsAppBarModel(): {
  hosts: AppBarHost[];
  remoteHosts: RemoteCloudHost[];
} {
  const { data } = useRemoteCloudHostsState();

  const remoteHosts = data?.hosts ?? [];

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
    remoteHosts,
  };
}
