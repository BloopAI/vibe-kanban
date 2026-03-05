import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queueApi } from '@/shared/lib/api';
import type { ExecutorConfig, QueueStatus, QueuedMessage } from 'shared/types';

interface UseSessionQueueInteractionOptions {
  /** Session ID for queue operations */
  sessionId: string | undefined;
}

interface UseSessionQueueInteractionResult {
  /** Whether a message is currently queued */
  isQueued: boolean;
  /** Next queued message to execute */
  nextQueuedMessage: QueuedMessage | null;
  /** Pending steer messages (high priority) */
  pendingSteers: QueuedMessage[];
  /** Pending buffered queue messages */
  queuedMessages: QueuedMessage[];
  /** Total pending queued messages */
  pendingCount: number;
  /** Whether a queue operation is in progress */
  isQueueLoading: boolean;
  /** Queue a message for later execution */
  queueMessage: (
    message: string,
    executorConfig: ExecutorConfig
  ) => Promise<void>;
  /** Queue a high-priority steer message */
  steerMessage: (
    message: string,
    executorConfig: ExecutorConfig
  ) => Promise<void>;
  /** Pop latest queued message so it can be edited */
  cancelQueue: () => Promise<QueuedMessage | null>;
  /** Refresh queue status from server */
  refreshQueueStatus: () => Promise<void>;
}

const QUEUE_STATUS_KEY = 'queue-status';

/**
 * Hook to manage queue interaction for session messages.
 * Uses TanStack Query for caching and mutation handling.
 */
export function useSessionQueueInteraction({
  sessionId,
}: UseSessionQueueInteractionOptions): UseSessionQueueInteractionResult {
  const queryClient = useQueryClient();

  // Query for queue status
  const { data: queueStatus = { status: 'empty' as const }, refetch } =
    useQuery<QueueStatus>({
      queryKey: [QUEUE_STATUS_KEY, sessionId],
      queryFn: () => queueApi.getStatus(sessionId!),
      enabled: !!sessionId,
    });

  const queuedData =
    queueStatus.status === 'queued'
      ? (queueStatus as Extract<QueueStatus, { status: 'queued' }>)
      : null;
  const isQueued = !!queuedData;
  const nextQueuedMessage = queuedData?.next ?? null;
  const pendingSteers = queuedData?.pending_steers ?? [];
  const queuedMessages = queuedData?.queued_messages ?? [];
  const pendingCount = pendingSteers.length + queuedMessages.length;

  // Mutation for queueing a message
  const queueMutation = useMutation({
    mutationFn: ({
      message,
      executorConfig,
    }: {
      message: string;
      executorConfig: ExecutorConfig;
    }) =>
      queueApi.queue(sessionId!, {
        message,
        executor_config: executorConfig,
      }),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  const steerMutation = useMutation({
    mutationFn: ({
      message,
      executorConfig,
    }: {
      message: string;
      executorConfig: ExecutorConfig;
    }) =>
      queueApi.steer(sessionId!, {
        message,
        executor_config: executorConfig,
      }),
    onSuccess: (status) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], status);
    },
  });

  // Mutation for cancelling the queue
  const cancelMutation = useMutation({
    mutationFn: () => queueApi.cancel(sessionId!),
    onSuccess: (response) => {
      queryClient.setQueryData([QUEUE_STATUS_KEY, sessionId], response.status);
    },
  });

  const queueMessage = useCallback(
    async (message: string, executorConfig: ExecutorConfig) => {
      if (!sessionId) return;
      await queueMutation.mutateAsync({
        message,
        executorConfig,
      });
    },
    [sessionId, queueMutation]
  );

  const steerMessage = useCallback(
    async (message: string, executorConfig: ExecutorConfig) => {
      if (!sessionId) return;
      await steerMutation.mutateAsync({
        message,
        executorConfig,
      });
    },
    [sessionId, steerMutation]
  );

  const cancelQueue = useCallback(async () => {
    if (!sessionId) return null;
    const result = await cancelMutation.mutateAsync();
    return result.cancelled_message ?? null;
  }, [sessionId, cancelMutation]);

  const refreshQueueStatus = useCallback(async () => {
    if (!sessionId) return;
    await refetch();
  }, [sessionId, refetch]);

  return {
    isQueued,
    nextQueuedMessage,
    pendingSteers,
    queuedMessages,
    pendingCount,
    isQueueLoading:
      queueMutation.isPending ||
      steerMutation.isPending ||
      cancelMutation.isPending,
    queueMessage,
    steerMessage,
    cancelQueue,
    refreshQueueStatus,
  };
}
