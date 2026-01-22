import { useQuery } from '@tanstack/react-query';
import { repoApi } from '@/lib/api';
import type { RalphCheckResponse } from 'shared/types';

export function useRalphCheck(repoId: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['ralph-check', repoId],
    queryFn: () => repoApi.checkRalphReady(repoId!),
    enabled: options?.enabled !== false && !!repoId,
  });
}

export function useRalphCheckMultiple(repoIds: string[], options?: { enabled?: boolean }) {
  return useQuery<Array<RalphCheckResponse & { repoId: string }>>({
    queryKey: ['ralph-check-multiple', ...repoIds],
    queryFn: async () => {
      const results = await Promise.all(
        repoIds.map(async (repoId) => {
          const res = await repoApi.checkRalphReady(repoId);
          return { repoId, ...res };
        })
      );
      return results;
    },
    enabled: options?.enabled !== false && repoIds.length > 0,
  });
}
