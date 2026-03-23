import { useQuery } from '@tanstack/react-query';
import { configApi } from '@/shared/lib/api';

/** Per-executor capabilities query. Probes ACP servers on demand. */
export function useCapabilities(executor: string | null) {
  return useQuery<string[]>({
    queryKey: ['agent-capabilities', executor],
    queryFn: () => configApi.getCapabilities(executor!),
    enabled: !!executor,
    staleTime: 5 * 60 * 1000,
  });
}
