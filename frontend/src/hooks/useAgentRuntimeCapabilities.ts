import { useQuery } from '@tanstack/react-query';
import type { BaseCodingAgent } from 'shared/types';
import { configApi } from '@/lib/api';

export function useAgentRuntimeCapabilities(executor?: BaseCodingAgent | null) {
  return useQuery({
    queryKey: ['agentRuntimeCapabilities', executor],
    queryFn: () => configApi.getAgentRuntimeCapabilities(executor!),
    enabled: !!executor,
    staleTime: 5 * 60 * 1000,
  });
}
