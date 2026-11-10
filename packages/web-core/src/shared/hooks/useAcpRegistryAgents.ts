import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { MachineClient } from '@/shared/lib/machineClient';
import type { AcpRegistryAgent } from 'shared/types';

function machineScope(machineClient: MachineClient | null) {
  return machineClient?.queryScopeKey ?? (['machine', 'unselected'] as const);
}

export function useMachineAcpRegistryAgents(
  machineClient: MachineClient | null
) {
  return useQuery<AcpRegistryAgent[]>({
    queryKey: ['acp-registry-agents', ...machineScope(machineClient)],
    queryFn: () => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return machineClient.listAcpRegistryAgents();
    },
    enabled: machineClient != null,
    staleTime: 15 * 60 * 1000,
  });
}

export type InstallVariables = { id: string; install: boolean };

function installMutationKey(machineClient: MachineClient | null) {
  return ['acp-registry-install', ...machineScope(machineClient)];
}

export function useMachineAcpRegistryInstall(
  machineClient: MachineClient | null,
  {
    onError,
    onSettled,
  }: {
    // Mutation-level so it fires for every request; mutate()'s own callbacks
    // only fire for the latest call, and several rows can be in flight
    onError?: (error: Error, variables: InstallVariables) => void;
    onSettled?: () => void;
  } = {}
) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, InstallVariables>({
    mutationKey: installMutationKey(machineClient),
    mutationFn: ({ id, install }) => {
      if (!machineClient) {
        throw new Error('Machine client is required');
      }

      return install
        ? machineClient.installAcpRegistryAgent(id)
        : machineClient.uninstallAcpRegistryAgent(id);
    },
    onError,
    // Refetch even on failure: the server may have changed profiles anyway
    onSettled: async () => {
      const scope = machineScope(machineClient);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['acp-registry-agents', ...scope],
        }),
        // Agent picker in the configurations card
        queryClient.invalidateQueries({ queryKey: ['profiles', ...scope] }),
      ]);
      onSettled?.();
    },
  });
}

/** Ids with an install/uninstall request in flight on this machine */
export function usePendingAcpRegistryInstalls(
  machineClient: MachineClient | null
): Set<string> {
  const ids = useMutationState({
    filters: {
      mutationKey: installMutationKey(machineClient),
      status: 'pending',
    },
    select: (mutation) => (mutation.state.variables as InstallVariables).id,
  });
  return new Set(ids);
}
