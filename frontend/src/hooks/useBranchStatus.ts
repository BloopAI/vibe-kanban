import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useBranchStatus(attemptId?: string) {
  const result = useQuery({
    queryKey: ['branchStatus', attemptId],
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    refetchInterval: 5000,
  });
  return {
    data: result.data,
    error: result.error,
    isError: result.isError,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}
