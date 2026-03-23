import { useQuery } from '@tanstack/react-query';
import type { RJSFSchema } from '@rjsf/utils';
import type { BaseCodingAgent } from 'shared/types';
import { agentsApi } from '@/shared/lib/api';
import type { MachineClient } from '@/shared/lib/machineClient';

export const executorSchemaKeys = {
  all: ['executor-schema'] as const,
  byExecutor: (executor: BaseCodingAgent | null) =>
    ['executor-schema', executor] as const,
};

export function useExecutorSchema(
  executor: BaseCodingAgent | null,
  machineClient?: MachineClient | null
) {
  const scopeKey = machineClient?.queryScopeKey ?? ['machine', 'local'];
  return useQuery<RJSFSchema | null>({
    queryKey: [...executorSchemaKeys.byExecutor(executor), ...scopeKey],
    queryFn: async () => {
      if (!executor) return null;
      if (machineClient) {
        return machineClient.getExecutorSchema(executor) as Promise<RJSFSchema>;
      }
      return agentsApi.getSchema(executor) as Promise<RJSFSchema>;
    },
    enabled: !!executor,
    staleTime: Infinity,
  });
}
