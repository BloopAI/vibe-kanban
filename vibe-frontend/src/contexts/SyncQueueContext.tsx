import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  QueuedOperation,
  OperationType,
  HttpMethod,
  loadSyncQueue,
  enqueueOperation,
  dequeueOperation,
  incrementRetryCount,
  getPendingOperations,
  clearFailedOperations,
  clearAllOperations,
  isOperationFailed,
  updateLastSyncAttempt,
} from '@/lib/syncQueue';
import { useConnectionSafe } from './ConnectionContext';

interface SyncQueueContextValue {
  /** All pending operations */
  pendingOperations: QueuedOperation[];
  /** Number of pending operations */
  pendingCount: number;
  /** Number of failed operations */
  failedCount: number;
  /** Whether sync is currently in progress */
  isSyncing: boolean;
  /** Add an operation to the queue */
  queueOperation: (params: {
    type: OperationType;
    endpoint: string;
    method: HttpMethod;
    body?: unknown;
    description: string;
    maxRetries?: number;
  }) => Promise<QueuedOperation>;
  /** Manually trigger sync process */
  processQueue: () => Promise<void>;
  /** Clear all failed operations */
  clearFailed: () => Promise<void>;
  /** Clear all operations */
  clearAll: () => Promise<void>;
}

const SyncQueueContext = createContext<SyncQueueContextValue | null>(null);

interface SyncQueueProviderProps {
  children: React.ReactNode;
}

export function SyncQueueProvider({ children }: SyncQueueProviderProps) {
  const [pendingOperations, setPendingOperations] = useState<QueuedOperation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { state: connectionState, reportSuccess, reportFailure } = useConnectionSafe();

  // Load queue from IndexedDB on mount
  useEffect(() => {
    loadSyncQueue().then((state) => {
      setPendingOperations(state.operations);
    });
  }, []);

  // Calculate counts
  const pendingCount = pendingOperations.length;
  const failedCount = pendingOperations.filter(isOperationFailed).length;

  // Queue an operation
  const queueOperation = useCallback(async (params: {
    type: OperationType;
    endpoint: string;
    method: HttpMethod;
    body?: unknown;
    description: string;
    maxRetries?: number;
  }): Promise<QueuedOperation> => {
    const operation = await enqueueOperation({
      type: params.type,
      endpoint: params.endpoint,
      method: params.method,
      body: params.body,
      description: params.description,
      maxRetries: params.maxRetries ?? 3,
    });

    setPendingOperations((prev) => [...prev, operation]);
    return operation;
  }, []);

  // Process the queue
  const processQueue = useCallback(async () => {
    if (isSyncing || connectionState !== 'online') {
      return;
    }

    const operations = await getPendingOperations();
    if (operations.length === 0) {
      return;
    }

    setIsSyncing(true);
    await updateLastSyncAttempt();

    for (const operation of operations) {
      if (isOperationFailed(operation)) {
        continue; // Skip failed operations
      }

      try {
        // Get auth token if available
        const token = localStorage.getItem('clerk-token') || '';

        const response = await fetch(operation.endpoint, {
          method: operation.method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: operation.body ? JSON.stringify(operation.body) : undefined,
        });

        if (response.ok) {
          await dequeueOperation(operation.id);
          setPendingOperations((prev) => prev.filter((op) => op.id !== operation.id));
          reportSuccess();
        } else if (response.status >= 500) {
          // Server error - increment retry count
          const updated = await incrementRetryCount(operation.id);
          if (updated) {
            setPendingOperations((prev) =>
              prev.map((op) => (op.id === operation.id ? updated : op))
            );
          }
          reportFailure(new Error(`Server error: ${response.status}`));
        } else {
          // Client error (4xx) - don't retry, mark as failed
          const updated = await incrementRetryCount(operation.id);
          if (updated) {
            // Set retry count to max to mark as failed
            updated.retryCount = updated.maxRetries;
            setPendingOperations((prev) =>
              prev.map((op) => (op.id === operation.id ? updated : op))
            );
          }
        }
      } catch (error) {
        // Network error - increment retry count
        const updated = await incrementRetryCount(operation.id);
        if (updated) {
          setPendingOperations((prev) =>
            prev.map((op) => (op.id === operation.id ? updated : op))
          );
        }
        reportFailure(error instanceof Error ? error : new Error('Network error'));
      }
    }

    setIsSyncing(false);
  }, [isSyncing, connectionState, reportSuccess, reportFailure]);

  // Auto-process queue when connection becomes online
  useEffect(() => {
    if (connectionState === 'online' && pendingCount > 0 && !isSyncing) {
      // Small delay to avoid immediate retry on connection restore
      const timer = setTimeout(() => {
        processQueue();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [connectionState, pendingCount, isSyncing, processQueue]);

  // Clear failed operations
  const clearFailed = useCallback(async () => {
    await clearFailedOperations();
    const operations = await getPendingOperations();
    setPendingOperations(operations);
  }, []);

  // Clear all operations
  const clearAll = useCallback(async () => {
    await clearAllOperations();
    setPendingOperations([]);
  }, []);

  const value: SyncQueueContextValue = {
    pendingOperations,
    pendingCount,
    failedCount,
    isSyncing,
    queueOperation,
    processQueue,
    clearFailed,
    clearAll,
  };

  return (
    <SyncQueueContext.Provider value={value}>
      {children}
    </SyncQueueContext.Provider>
  );
}

export function useSyncQueue(): SyncQueueContextValue {
  const context = useContext(SyncQueueContext);
  if (!context) {
    throw new Error('useSyncQueue must be used within a SyncQueueProvider');
  }
  return context;
}

/**
 * Safe version of useSyncQueue that returns default values if not in provider.
 */
export function useSyncQueueSafe(): SyncQueueContextValue {
  const context = useContext(SyncQueueContext);
  if (!context) {
    return {
      pendingOperations: [],
      pendingCount: 0,
      failedCount: 0,
      isSyncing: false,
      queueOperation: async () => {
        throw new Error('SyncQueueProvider not available');
      },
      processQueue: async () => {},
      clearFailed: async () => {},
      clearAll: async () => {},
    };
  }
  return context;
}
