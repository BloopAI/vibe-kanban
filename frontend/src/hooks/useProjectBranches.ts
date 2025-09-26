import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '@/lib/api';
import type { GitBranch } from 'shared/types';

interface UseProjectBranchesOptions {
  enabled?: boolean;
}

export const queryKey = (projectId?: string) =>
  ['projectBranches', projectId] as const;

export function useProjectBranches(
  projectId?: string,
  options: UseProjectBranchesOptions = {}
): {
  branches: GitBranch[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<GitBranch[] | undefined>;
  hasBranch: (name?: string | null) => boolean;
  pickBranch: (...preferred: Array<string | null | undefined>) => string | null;
  currentBranchName: string | null;
} {
  const { enabled = true } = options;
  const canFetch = Boolean(projectId) && enabled;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKey(projectId),
    queryFn: async () => {
      if (!projectId) return [];
      return await projectsApi.getBranches(projectId);
    },
    enabled: canFetch,
    staleTime: 5000,
  });

  const branches = data ?? [];

  const hasBranch = useCallback(
    (name?: string | null) =>
      Boolean(name && branches.some((branch) => branch.name === name)),
    [branches]
  );

  const currentBranchName = useMemo(() => {
    const current = branches.find((branch) => branch.is_current);
    return current ? current.name : null;
  }, [branches]);

  const pickBranch = useCallback(
    (...preferred: Array<string | null | undefined>) => {
      for (const candidate of preferred) {
        if (candidate && hasBranch(candidate)) {
          return candidate;
        }
      }
      if (currentBranchName && hasBranch(currentBranchName)) {
        return currentBranchName;
      }
      return branches[0]?.name ?? null;
    },
    [branches, hasBranch, currentBranchName]
  );

  return {
    branches,
    loading: isLoading,
    error: (error as Error) ?? null,
    refresh: () => refetch().then((result) => result.data),
    hasBranch,
    pickBranch,
    currentBranchName,
  };
}
