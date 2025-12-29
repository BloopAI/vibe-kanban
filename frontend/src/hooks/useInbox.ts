import { useState, useEffect, useCallback } from 'react';
import { inboxApi } from '@/lib/api';
import type { InboxItem, CreateInboxItem, InboxSummary } from 'shared/types';

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

export function useInbox(): UseInboxResult {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await inboxApi.list();
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch inbox'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const data = await inboxApi.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch inbox summary:', err);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshSummary();
  }, [refresh, refreshSummary]);

  const createItem = useCallback(
    async (data: CreateInboxItem) => {
      const newItem = await inboxApi.create(data);
      setItems((prev) => [newItem, ...prev]);
      refreshSummary();
      return newItem;
    },
    [refreshSummary]
  );

  const markAsRead = useCallback(
    async (itemId: string) => {
      const updatedItem = await inboxApi.markAsRead(itemId);
      setItems((prev) =>
        prev.map((item) => (item.id === itemId ? updatedItem : item))
      );
      refreshSummary();
      return updatedItem;
    },
    [refreshSummary]
  );

  const markAllAsRead = useCallback(async () => {
    await inboxApi.markAllAsRead();
    setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
    refreshSummary();
  }, [refreshSummary]);

  const deleteItem = useCallback(
    async (itemId: string) => {
      await inboxApi.delete(itemId);
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      refreshSummary();
    },
    [refreshSummary]
  );

  return {
    items,
    summary,
    isLoading,
    error,
    refresh,
    refreshSummary,
    createItem,
    markAsRead,
    markAllAsRead,
    deleteItem,
  };
}
