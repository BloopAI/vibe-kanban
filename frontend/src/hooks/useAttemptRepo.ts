import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useAttemptRepo(attemptId?: string) {
  const query = useQuery({
    queryKey: ['attemptRepo', attemptId],
    queryFn: async () => {
      const repos = await attemptsApi.getRepos(attemptId!);
      return repos;
    },
    enabled: !!attemptId,
  });

  return {
    repos: query.data ?? [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
