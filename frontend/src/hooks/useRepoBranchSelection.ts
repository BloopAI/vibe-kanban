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

/** Repo with optional configured default branch from project settings */
export type RepoWithDefaultBranch = Repo & {
  /** User-configured default branch for this repo (from ProjectRepo.default_branch) */
  configuredDefaultBranch?: string | null;
};

type UseRepoBranchSelectionOptions = {
  repos: RepoWithDefaultBranch[];
  initialBranch?: string | null;
  enabled?: boolean;
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
        // Priority order:
        // 1. initialBranch (e.g., from parent attempt)
        // 2. User-configured default branch from project settings
        // 3. Auto-detected default branch from remote (is_default)
        // 4. Currently checked out branch (is_current)
        // 5. First branch in the list
        if (initialBranch && branches.some((b) => b.name === initialBranch)) {
          targetBranch = initialBranch;
        } else if (
          repo.configuredDefaultBranch &&
          branches.some((b) => b.name === repo.configuredDefaultBranch)
        ) {
          targetBranch = repo.configuredDefaultBranch;
        } else {
          const defaultBranch = branches.find((b) => b.is_default && !b.is_remote);
          const currentBranch = branches.find((b) => b.is_current);
          targetBranch =
            defaultBranch?.name ??
            currentBranch?.name ??
            branches[0]?.name ??
            null;
        }
      }

      return {
        repoId: repo.id,
        repoDisplayName: repo.display_name,
        targetBranch,
        branches,
      };
    });
  }, [repos, queries, userOverrides, initialBranch]);

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
