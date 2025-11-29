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

export function useQueueStatus(attemptId?: string): UseQueueStatusResult {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    status: 'empty',
  });
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!attemptId) return;
    try {
      const status = await queueApi.getStatus(attemptId);
      setQueueStatus(status);
    } catch (e) {
      console.error('Failed to fetch queue status:', e);
    }
  }, [attemptId]);

  const queueMessage = useCallback(
    async (message: string, variant: string | null) => {
      if (!attemptId) return;
      setIsLoading(true);
      try {
        const status = await queueApi.queue(attemptId, { message, variant });
        setQueueStatus(status);
      } finally {
        setIsLoading(false);
      }
    },
    [attemptId]
  );

  const cancelQueue = useCallback(async () => {
    if (!attemptId) return;
    setIsLoading(true);
    try {
      const status = await queueApi.cancel(attemptId);
      setQueueStatus(status);
    } finally {
      setIsLoading(false);
    }
  }, [attemptId]);

  // Fetch initial status when attemptId changes
  useEffect(() => {
    if (attemptId) {
      refresh();
    } else {
      setQueueStatus({ status: 'empty' });
    }
  }, [attemptId, refresh]);

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
