import { useState, useMemo, useCallback } from 'react';
import { useBranches } from './useBranches';
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
};

type UseRepoBranchSelectionReturn = {
  configs: RepoBranchConfig[];
  isLoading: boolean;
  setRepoBranch: (repoId: string, branch: string) => void;
  getAttemptRepoInputs: () => Array<{ repo_id: string; target_branch: string }>;
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

  const { data: branchMap, isLoading: isLoadingBranches } = useBranches(repos, {
    enabled,
  });

  const configs = useMemo((): RepoBranchConfig[] => {
    return repos.map((repo) => {
      const branches = branchMap.get(repo.id) ?? [];

      let targetBranch: string | null = userOverrides[repo.id] ?? null;

      if (targetBranch === null) {
        if (initialBranch && branches.some((b) => b.name === initialBranch)) {
          targetBranch = initialBranch;
        } else {
          const currentBranch = branches.find((b) => b.is_current);
          targetBranch = currentBranch?.name ?? branches[0]?.name ?? null;
        }
      }

      return {
        repoId: repo.id,
        repoDisplayName: repo.display_name,
        targetBranch,
        branches,
      };
    });
  }, [repos, branchMap, userOverrides, initialBranch]);

  const setRepoBranch = useCallback((repoId: string, branch: string) => {
    setUserOverrides((prev) => ({
      ...prev,
      [repoId]: branch,
    }));
  }, []);

  const reset = useCallback(() => {
    setUserOverrides({});
  }, []);

  const getAttemptRepoInputs = useCallback(() => {
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
    getAttemptRepoInputs,
    reset,
  };
}
