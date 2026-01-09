import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inboxApi } from '@/lib/api';
import type { InboxItem, CreateInboxItem, InboxSummary } from 'shared/types';

// Helper to check if error is a rate limit (429)
function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('429') || error.message.includes('Too Many Requests');
  }
  return false;
}

// Query keys for consistent caching
export const inboxKeys = {
  all: ['inbox'] as const,
  items: () => [...inboxKeys.all, 'items'] as const,
  summary: () => [...inboxKeys.all, 'summary'] as const,
};

export interface UseInboxResult {
  items: InboxItem[];
  summary: InboxSummary | null;
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  createItem: (data: CreateInboxItem) => Promise<InboxItem>;
  markAsRead: (itemId: string) => Promise<InboxItem>;
  markAllAsRead: () => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
}

/**
 * Hook for managing inbox items with TanStack Query for request deduplication.
 */
export function useInbox(): UseInboxResult {
  const queryClient = useQueryClient();

  // Query for inbox items
  const {
    data: items = [],
    isLoading,
    error: itemsError,
  } = useQuery<InboxItem[]>({
    queryKey: inboxKeys.items(),
    queryFn: () => inboxApi.list(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  // Query for inbox summary
  const { data: summary = null } = useQuery<InboxSummary>({
    queryKey: inboxKeys.summary(),
    queryFn: () => inboxApi.getSummary(),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
    retryDelay: 60000,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKeys.items() });
  }, [queryClient]);

  const refreshSummary = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKeys.summary() });
  }, [queryClient]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreateInboxItem) => inboxApi.create(data),
    onSuccess: (newItem) => {
      queryClient.setQueryData<InboxItem[]>(inboxKeys.items(), (old) =>
        old ? [newItem, ...old] : [newItem]
      );
      queryClient.invalidateQueries({ queryKey: inboxKeys.summary() });
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: (itemId: string) => inboxApi.markAsRead(itemId),
    onSuccess: (updatedItem) => {
      queryClient.setQueryData<InboxItem[]>(inboxKeys.items(), (old) =>
        old?.map((item) => (item.id === updatedItem.id ? updatedItem : item)) ?? []
      );
      queryClient.invalidateQueries({ queryKey: inboxKeys.summary() });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: () => inboxApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.setQueryData<InboxItem[]>(inboxKeys.items(), (old) =>
        old?.map((item) => ({ ...item, is_read: true })) ?? []
      );
      queryClient.invalidateQueries({ queryKey: inboxKeys.summary() });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => inboxApi.delete(itemId),
    onSuccess: (_, itemId) => {
      queryClient.setQueryData<InboxItem[]>(inboxKeys.items(), (old) =>
        old?.filter((item) => item.id !== itemId) ?? []
      );
      queryClient.invalidateQueries({ queryKey: inboxKeys.summary() });
    },
  });

  const createItem = useCallback(
    async (data: CreateInboxItem) => createMutation.mutateAsync(data),
    [createMutation]
  );

  const markAsRead = useCallback(
    async (itemId: string) => markAsReadMutation.mutateAsync(itemId),
    [markAsReadMutation]
  );

  const markAllAsRead = useCallback(
    async () => { await markAllAsReadMutation.mutateAsync(); },
    [markAllAsReadMutation]
  );

  const deleteItem = useCallback(
    async (itemId: string) => { await deleteMutation.mutateAsync(itemId); },
    [deleteMutation]
  );

  return {
    items,
    summary,
    isLoading,
    error: itemsError ? (itemsError instanceof Error ? itemsError : new Error('Failed to fetch inbox')) : null,
    refresh,
    refreshSummary,
    createItem,
    markAsRead,
    markAllAsRead,
    deleteItem,
  };
}
