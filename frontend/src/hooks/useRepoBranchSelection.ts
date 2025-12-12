import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBranches } from './useBranches';
import { projectsApi } from '@/lib/api';
import type { GitBranch, Repo, RepositoryBranches } from 'shared/types';

export type RepoBranchConfig = {
  repoId: string;
  repoDisplayName: string;
  targetBranch: string | null;
  branches: GitBranch[];
};

type UseRepoBranchSelectionOptions = {
  projectId: string | undefined;
  initialBranch?: string | null;
  enabled?: boolean;
};

type UseRepoBranchSelectionReturn = {
  configs: RepoBranchConfig[];
  repositoryBranches: RepositoryBranches[];
  projectRepos: Repo[];
  isLoading: boolean;
  setRepoBranch: (repoId: string, branch: string) => void;
  getAttemptRepoInputs: () => Array<{ repo_id: string; target_branch: string }>;
  reset: () => void;
};

export function useRepoBranchSelection({
  projectId,
  initialBranch,
  enabled = true,
}: UseRepoBranchSelectionOptions): UseRepoBranchSelectionReturn {
  const [userOverrides, setUserOverrides] = useState<
    Record<string, string | null>
  >({});

  const { data: repositoryBranches = [], isLoading: isLoadingBranches } =
    useBranches(projectId, { enabled: enabled && !!projectId });

  const { data: projectRepos = [], isLoading: isLoadingRepos } = useQuery({
    queryKey: ['projectRepositories', projectId],
    queryFn: () =>
      projectId ? projectsApi.getRepositories(projectId) : Promise.resolve([]),
    enabled: enabled && !!projectId,
  });

  const configs = useMemo((): RepoBranchConfig[] => {
    return projectRepos.map((repo) => {
      const repoBranchData = repositoryBranches.find(
        (rb) => rb.repository_id === repo.id
      );
      const branches = repoBranchData?.branches ?? [];

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
  }, [projectRepos, repositoryBranches, userOverrides, initialBranch]);

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
    repositoryBranches,
    projectRepos,
    isLoading: isLoadingBranches || isLoadingRepos,
    setRepoBranch,
    getAttemptRepoInputs,
    reset,
  };
}
