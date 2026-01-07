import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pendingCommitsApi } from '@/lib/api';
import type { CommitPendingRequest } from 'shared/types';

const QUERY_KEY = ['pending-commits'];
const COUNT_QUERY_KEY = ['pending-commits', 'count'];

export function usePendingCommits() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: pendingCommitsApi.list,
    refetchInterval: 30000, // refetch cada 30s
  });
}

export function usePendingCommitsCount() {
  return useQuery({
    queryKey: COUNT_QUERY_KEY,
    queryFn: pendingCommitsApi.getCount,
    refetchInterval: 10000, // refetch cada 10s para badge
  });
}

export function useCommitPending() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CommitPendingRequest }) =>
      pendingCommitsApi.commit(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COUNT_QUERY_KEY });
    },
  });
}

export function useDiscardPendingCommit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => pendingCommitsApi.discard(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COUNT_QUERY_KEY });
    },
  });
}

export function useDiscardAllPendingCommits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: pendingCommitsApi.discardAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COUNT_QUERY_KEY });
    },
  });
}
