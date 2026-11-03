import { useQuery } from '@tanstack/react-query';
import type { MachineClient } from '@/shared/lib/machineClient';
import type { AcpRegistryAgent } from 'shared/types';

export function useMachineAcpRegistryAgents(
  machineClient: MachineClient | null
) {
  return useQuery<AcpRegistryAgent[]>({
    queryKey: [
      'acp-registry-agents',
      ...(machineClient?.queryScopeKey ?? ['machine', 'unselected']),
    ],
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
