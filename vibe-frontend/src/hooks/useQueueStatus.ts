import { useState, useCallback, useEffect } from 'react';
import { queueApi } from '@/lib/api';
import type { QueueStatus, QueuedMessage } from 'shared/types';

interface UseQueueStatusResult {
  /** Current queue status */
  queueStatus: QueueStatus;
  /** Whether a message is currently queued */
  isQueued: boolean;
  /** The queued message if any */
  queuedMessage: QueuedMessage | null;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Queue a new message */
  queueMessage: (message: string, variant: string | null) => Promise<void>;
  /** Cancel the queued message */
  cancelQueue: () => Promise<void>;
  /** Refresh the queue status from the server */
  refresh: () => Promise<void>;
}

export function useQueueStatus(sessionId?: string): UseQueueStatusResult {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    status: 'empty',
  });
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const status = await queueApi.getStatus(sessionId);
      setQueueStatus(status);
    } catch (e) {
      console.error('Failed to fetch queue status:', e);
    }
  }, [sessionId]);

  const queueMessage = useCallback(
    async (message: string, variant: string | null) => {
      if (!sessionId) return;
      setIsLoading(true);
      try {
        const status = await queueApi.queue(sessionId, { message, variant });
        setQueueStatus(status);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const cancelQueue = useCallback(async () => {
    if (!sessionId) return;
    setIsLoading(true);
    try {
      const status = await queueApi.cancel(sessionId);
      setQueueStatus(status);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Fetch initial status when sessionId changes
  useEffect(() => {
    if (sessionId) {
      refresh();
    } else {
      setQueueStatus({ status: 'empty' });
    }
  }, [sessionId, refresh]);

  const isQueued = queueStatus.status === 'queued';
  const queuedMessage = isQueued
    ? (queueStatus as Extract<QueueStatus, { status: 'queued' }>).message
    : null;

  return {
    queueStatus,
    isQueued,
    queuedMessage,
    isLoading,
    queueMessage,
    cancelQueue,
    refresh,
  };
}
