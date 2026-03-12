import { useQuery, useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { repoApi } from '@/shared/lib/api';
import { getHostRequestScopeQueryKey } from '@/shared/lib/hostRequestScope';
import type { MachineClient } from '@/shared/lib/machineClient';
import type { GitBranch } from 'shared/types';

export const repoBranchKeys = {
  all: ['repoBranches'] as const,
  byRepo: (repoId: string | undefined) => ['repoBranches', repoId] as const,
};

type Options = {
  enabled?: boolean;
  hostId?: string | null;
};

export function useRepoBranches(repoId?: string | null, opts?: Options) {
  const enabled = (opts?.enabled ?? true) && !!repoId;
  const hostId = opts?.hostId;

  return useQuery<GitBranch[]>({
    queryKey: [
      ...repoBranchKeys.byRepo(repoId ?? undefined),
      getHostRequestScopeQueryKey(hostId),
    ],
    queryFn: () => repoApi.getBranches(repoId!, hostId),
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

type MachineOptions = {
  enabled?: boolean;
};

export function useMachineRepoBranches(
  machineClient: MachineClient | null,
  repoId?: string | null,
  opts?: MachineOptions
) {
  const enabled = (opts?.enabled ?? true) && !!repoId && machineClient != null;

  return useQuery<GitBranch[]>({
    queryKey: [
      ...repoBranchKeys.byRepo(repoId ?? undefined),
      ...(machineClient?.queryScopeKey ?? ['machine', 'unselected']),
    ],
    queryFn: () => {
      if (!machineClient || !repoId) {
        throw new Error('Machine client and repo id are required');
      }

      return machineClient.getRepoBranches(repoId);
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

interface UseMultiRepoBranchesResult {
  branchesByRepo: Record<string, GitBranch[]>;
  isLoading: boolean;
  isError: boolean;
}

export function useMultiRepoBranches(
  repoIds: string[]
): UseMultiRepoBranchesResult {
  const queries = useQueries({
    queries: repoIds.map((repoId) => ({
      queryKey: repoBranchKeys.byRepo(repoId),
      queryFn: () => repoApi.getBranches(repoId),
      staleTime: 60_000,
    })),
  });

  const branchesByRepo = useMemo(() => {
    const result: Record<string, GitBranch[]> = {};
    repoIds.forEach((repoId, idx) => {
      if (queries[idx]?.data) {
        result[repoId] = queries[idx].data;
      }
    });
    return result;
  }, [repoIds, queries]);

  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  return { branchesByRepo, isLoading, isError };
}
