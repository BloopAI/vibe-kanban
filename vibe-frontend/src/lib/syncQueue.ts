import { get, set } from 'idb-keyval';

const SYNC_QUEUE_KEY = 'vibe-kanban-sync-queue';

export type OperationType = 'create' | 'update' | 'delete';
export type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedOperation {
  id: string;
  type: OperationType;
  endpoint: string;
  method: HttpMethod;
  body?: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  description: string; // Human-readable description for UI
}

export interface SyncQueueState {
  operations: QueuedOperation[];
  lastSyncAttempt: number | null;
}

/**
 * Generate a unique ID for queued operations
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Load the sync queue from IndexedDB
 */
export async function loadSyncQueue(): Promise<SyncQueueState> {
  try {
    const state = await get<SyncQueueState>(SYNC_QUEUE_KEY);
    return state || { operations: [], lastSyncAttempt: null };
  } catch (error) {
    console.warn('[SyncQueue] Failed to load queue:', error);
    return { operations: [], lastSyncAttempt: null };
  }
}

/**
 * Save the sync queue to IndexedDB
 */
async function saveSyncQueue(state: SyncQueueState): Promise<void> {
  try {
    await set(SYNC_QUEUE_KEY, state);
  } catch (error) {
    console.warn('[SyncQueue] Failed to save queue:', error);
  }
}

/**
 * Add an operation to the sync queue
 */
export async function enqueueOperation(
  operation: Omit<QueuedOperation, 'id' | 'timestamp' | 'retryCount'>
): Promise<QueuedOperation> {
  const state = await loadSyncQueue();

  const newOperation: QueuedOperation = {
    ...operation,
    id: generateId(),
    timestamp: Date.now(),
    retryCount: 0,
  };

  state.operations.push(newOperation);
  await saveSyncQueue(state);

  return newOperation;
}

/**
 * Remove an operation from the queue (after successful sync)
 */
export async function dequeueOperation(operationId: string): Promise<void> {
  const state = await loadSyncQueue();
  state.operations = state.operations.filter((op) => op.id !== operationId);
  await saveSyncQueue(state);
}

/**
 * Update an operation's retry count
 */
export async function incrementRetryCount(operationId: string): Promise<QueuedOperation | null> {
  const state = await loadSyncQueue();
  const operation = state.operations.find((op) => op.id === operationId);

  if (operation) {
    operation.retryCount += 1;
    await saveSyncQueue(state);
    return operation;
  }

  return null;
}

/**
 * Get all pending operations
 */
export async function getPendingOperations(): Promise<QueuedOperation[]> {
  const state = await loadSyncQueue();
  return state.operations;
}

/**
 * Get the count of pending operations
 */
export async function getPendingCount(): Promise<number> {
  const state = await loadSyncQueue();
  return state.operations.length;
}

/**
 * Clear all failed operations (those that exceeded max retries)
 */
export async function clearFailedOperations(): Promise<number> {
  const state = await loadSyncQueue();
  const before = state.operations.length;
  state.operations = state.operations.filter(
    (op) => op.retryCount < op.maxRetries
  );
  await saveSyncQueue(state);
  return before - state.operations.length;
}

/**
 * Clear all operations (use with caution)
 */
export async function clearAllOperations(): Promise<void> {
  await saveSyncQueue({ operations: [], lastSyncAttempt: null });
}

/**
 * Update last sync attempt timestamp
 */
export async function updateLastSyncAttempt(): Promise<void> {
  const state = await loadSyncQueue();
  state.lastSyncAttempt = Date.now();
  await saveSyncQueue(state);
}

/**
 * Check if an operation has exceeded its retry limit
 */
export function isOperationFailed(operation: QueuedOperation): boolean {
  return operation.retryCount >= operation.maxRetries;
}

/**
 * Get operations that can still be retried
 */
export async function getRetryableOperations(): Promise<QueuedOperation[]> {
  const state = await loadSyncQueue();
  return state.operations.filter((op) => !isOperationFailed(op));
}

/**
 * Get failed operations (exceeded retry limit)
 */
export async function getFailedOperations(): Promise<QueuedOperation[]> {
  const state = await loadSyncQueue();
  return state.operations.filter((op) => isOperationFailed(op));
}
