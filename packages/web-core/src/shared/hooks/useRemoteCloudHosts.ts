import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppBarHost } from '@vibe/ui/components/AppBar';
import {
  type PairRemoteCloudHostInput,
  type RemoteCloudHost,
  getRemoteCloudHostsState,
  pairRemoteCloudHost,
  removeRemoteCloudHost,
  setActiveRemoteCloudHost,
  subscribeRemoteCloudHostsStore,
} from '@/shared/lib/remoteCloudHostsUiStore';

export const REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY = [
  'remote-cloud-hosts',
  'state',
] as const;

export function useRemoteCloudHostsState() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeRemoteCloudHostsStore(() => {
      void queryClient.invalidateQueries({
        queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
      });
    });
  }, [queryClient]);

  return useQuery({
    queryKey: REMOTE_CLOUD_HOSTS_STATE_QUERY_KEY,
    queryFn: getRemoteCloudHostsState,
    staleTime: 0,
  });
}

export function usePairRemoteCloudHostMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PairRemoteCloudHostInput) => pairRemoteCloudHost(input),
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
    mutationFn: (hostId: string) => removeRemoteCloudHost(hostId),
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
    mutationFn: (hostId: string) => setActiveRemoteCloudHost(hostId),
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
