import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { attemptsApi } from '@/lib/api';
import type { RepoWithTargetBranch } from 'shared/types';

export function useAttemptRepo(attemptId?: string) {
  const query = useQuery<RepoWithTargetBranch[]>({
    queryKey: ['attemptRepo', attemptId],
    queryFn: async () => {
      const repos = await attemptsApi.getRepos(attemptId!);
      return repos;
    },
    enabled: !!attemptId,
  });

  const repos = useMemo(() => query.data ?? [], [query.data]);
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);

  useEffect(() => {
    if (repos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(repos[0].id);
    }
  }, [repos, selectedRepoId]);

  return {
    repos,
    selectedRepoId,
    setSelectedRepoId,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
