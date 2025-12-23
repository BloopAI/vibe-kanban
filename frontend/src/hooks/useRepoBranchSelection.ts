import { useState, useMemo, useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { repoApi } from '@/lib/api';
import { repoBranchKeys } from './useRepoBranches';
import type { GitBranch, Repo } from 'shared/types';

export type RepoBranchConfig = {
  repoId: string;
  repoDisplayName: string;
  targetBranch: string | null;
  branches: GitBranch[];
};

type UseRepoBranchSelectionOptions = {
  repos: Repo[];
  initialBranch?: string | null;
  enabled?: boolean;
  preferRemoteBranch?: boolean;
};

type UseRepoBranchSelectionReturn = {
  configs: RepoBranchConfig[];
  isLoading: boolean;
  setRepoBranch: (repoId: string, branch: string) => void;
  getWorkspaceRepoInputs: () => Array<{
    repo_id: string;
    target_branch: string;
  }>;
  reset: () => void;
};

export function useRepoBranchSelection({
  repos,
  initialBranch,
  enabled = true,
  preferRemoteBranch = false,
}: UseRepoBranchSelectionOptions): UseRepoBranchSelectionReturn {
  const [userOverrides, setUserOverrides] = useState<
    Record<string, string | null>
  >({});

  const queries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: repoBranchKeys.byRepo(repo.id),
      queryFn: () => repoApi.getBranches(repo.id),
      enabled,
      staleTime: 60_000,
    })),
  });

  const isLoadingBranches = queries.some((q) => q.isLoading);

  const configs = useMemo((): RepoBranchConfig[] => {
    return repos.map((repo, i) => {
      const branches = queries[i]?.data ?? [];

      let targetBranch: string | null = userOverrides[repo.id] ?? null;

      if (targetBranch === null) {
        if (initialBranch && branches.some((b) => b.name === initialBranch)) {
          targetBranch = initialBranch;
        } else {
          // If remote branch preference is enabled, try to find a remote branch
          if (preferRemoteBranch) {
            // First try to find the remote version of the current branch
            // (e.g., if current is "main", look for "origin/main")
            const currentBranch = branches.find((b) => b.is_current);
            if (currentBranch) {
              // Look for matching remote branch (e.g., origin/main for main)
              const remoteBranch = branches.find((b) =>
                b.is_remote &&
                (b.name.includes('/') && b.name.split('/').pop() === currentBranch.name)
              );
              if (remoteBranch) {
                targetBranch = remoteBranch.name;
              } else {
                // If no direct remote equivalent, just pick the first remote branch
                const anyRemoteBranch = branches.find((b) => b.is_remote);
                targetBranch = anyRemoteBranch?.name ?? null;
              }
            } else {
              // If no current branch, just pick the first remote branch
              const anyRemoteBranch = branches.find((b) => b.is_remote);
              targetBranch = anyRemoteBranch?.name ?? null;
            }
          }

          // If no remote branch found or preference not enabled, fall back to current local branch
          if (targetBranch === null) {
            const currentBranch = branches.find((b) => b.is_current);
            targetBranch = currentBranch?.name ?? branches[0]?.name ?? null;
          }
        }
      }

      return {
        repoId: repo.id,
        repoDisplayName: repo.display_name,
        targetBranch,
        branches,
      };
    });
  }, [repos, queries, userOverrides, initialBranch, preferRemoteBranch]);

  const setRepoBranch = useCallback((repoId: string, branch: string) => {
    setUserOverrides((prev) => ({
      ...prev,
      [repoId]: branch,
    }));
  }, []);

  const reset = useCallback(() => {
    setUserOverrides({});
  }, []);

  const getWorkspaceRepoInputs = useCallback(() => {
    return configs
      .filter((config) => config.targetBranch !== null)
      .map((config) => ({
        repo_id: config.repoId,
        target_branch: config.targetBranch!,
      }));
  }, [configs]);

  return {
    configs,
    isLoading: isLoadingBranches,
    setRepoBranch,
    getWorkspaceRepoInputs,
    reset,
  };
}
