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
  /** When true, prefer remote tracking branch (e.g., origin/main) over local branch */
  preferRemoteBaseBranch?: boolean;
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

/**
 * Find the remote tracking branch for a given local branch.
 * E.g., for "main", look for "origin/main" in the branch list.
 */
function findRemoteTrackingBranch(
  localBranchName: string,
  branches: GitBranch[]
): GitBranch | undefined {
  // Common remote prefixes, try origin first as it's most common
  const remotePrefixes = ['origin/', 'upstream/'];

  for (const prefix of remotePrefixes) {
    const remoteName = `${prefix}${localBranchName}`;
    const remoteBranch = branches.find(
      (b) => b.is_remote && b.name === remoteName
    );
    if (remoteBranch) {
      return remoteBranch;
    }
  }

  return undefined;
}

export function useRepoBranchSelection({
  repos,
  initialBranch,
  enabled = true,
  preferRemoteBaseBranch = false,
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
          const currentBranch = branches.find((b) => b.is_current);
          let baseBranch = currentBranch?.name ?? branches[0]?.name ?? null;

          // If preferRemoteBaseBranch is enabled and we have a local branch,
          // try to find and use the remote tracking branch instead
          if (preferRemoteBaseBranch && baseBranch && currentBranch && !currentBranch.is_remote) {
            const remoteBranch = findRemoteTrackingBranch(baseBranch, branches);
            if (remoteBranch) {
              baseBranch = remoteBranch.name;
            }
          }

          targetBranch = baseBranch;
        }
      }

      return {
        repoId: repo.id,
        repoDisplayName: repo.display_name,
        targetBranch,
        branches,
      };
    });
  }, [repos, queries, userOverrides, initialBranch, preferRemoteBaseBranch]);

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
