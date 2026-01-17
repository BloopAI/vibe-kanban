import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';

export function useBranchStatus(attemptId?: string) {
  return useQuery({
    queryKey: ['branchStatus', attemptId],
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    refetchInterval: 15000, // 15秒に変更（5秒は過剰）
    staleTime: 10000, // 10秒間はキャッシュを使用
  });
}
