import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { acpServersApi, type RegistryEntryWithStatus } from '@/shared/lib/api';
import type { MachineClient } from '@/shared/lib/machineClient';
import type { InstalledAcpServer } from 'shared/types';

const acpServerKeys = {
  all: ['acp-servers'] as const,
  installed: ['acp-servers', 'installed'] as const,
  registry: ['acp-servers', 'registry'] as const,
};

/** Local-only installed servers query (used by AgentIcon self-lookup). */
export function useInstalledAcpServers() {
  return useQuery<InstalledAcpServer[]>({
    queryKey: acpServerKeys.installed,
    queryFn: acpServersApi.list,
    staleTime: 1000 * 30,
  });
}

/** Host-aware installed servers query (used in settings). */
export function useMachineAcpServers(machineClient: MachineClient | null) {
  const scopeKey = machineClient?.queryScopeKey ?? ['machine', 'unselected'];
  return useQuery<InstalledAcpServer[]>({
    queryKey: [...acpServerKeys.installed, ...scopeKey],
    queryFn: () => {
      if (!machineClient) throw new Error('Machine client required');
      return machineClient.listAcpServers();
    },
    enabled: machineClient != null,
    staleTime: 1000 * 30,
  });
}

/** Host-aware registry query (used in settings). */
export function useMachineAcpRegistry(machineClient: MachineClient | null) {
  const scopeKey = machineClient?.queryScopeKey ?? ['machine', 'unselected'];
  return useQuery<RegistryEntryWithStatus[]>({
    queryKey: [...acpServerKeys.registry, ...scopeKey],
    queryFn: () => {
      if (!machineClient) throw new Error('Machine client required');
      return machineClient.getAcpRegistry();
    },
    enabled: machineClient != null,
    staleTime: 1000 * 60 * 5,
  });
}

export function useMachineInstallFromRegistry(
  machineClient: MachineClient | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registryId: string) => {
      if (!machineClient) throw new Error('Machine client required');
      return machineClient.installAcpFromRegistry(registryId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: acpServerKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['user-system'] });
    },
  });
}

export function useMachineInstallCustom(machineClient: MachineClient | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!machineClient) throw new Error('Machine client required');
      return machineClient.installAcpCustom(name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: acpServerKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['user-system'] });
    },
  });
}

export function useMachineUninstallAcpServer(
  machineClient: MachineClient | null
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!machineClient) throw new Error('Machine client required');
      return machineClient.uninstallAcpServer(name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: acpServerKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['profiles'] });
      void queryClient.invalidateQueries({ queryKey: ['user-system'] });
    },
  });
}
