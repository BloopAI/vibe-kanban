import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { createEntityCollection } from './collections';
import { useSyncErrorContext } from '@/contexts/SyncErrorContext';
import type { EntityDefinition } from 'shared/remote-types';
import type { SyncError } from './types';

// Type helpers for extracting types from EntityDefinition
type EntityRowType<E> =
  E extends EntityDefinition<infer R, unknown, unknown> ? R : never;
type EntityCreateType<E> =
  E extends EntityDefinition<unknown, infer C, unknown> ? C : never;
type EntityUpdateType<E> =
  E extends EntityDefinition<unknown, unknown, infer U> ? U : never;

/**
 * Result of an optimistic mutation operation.
 * Contains a promise that resolves when the backend confirms the change.
 */
export interface MutationResult {
  /** Promise that resolves when the mutation is confirmed by the backend */
  persisted: Promise<void>;
}

/**
 * Result of an insert operation, including the created entity data.
 */
export interface InsertResult<TRow> {
  /** The optimistically created entity with generated ID */
  data: TRow;
  /** Promise that resolves with the synced entity (including server-generated fields) when confirmed by backend */
  persisted: Promise<TRow>;
}

/**
 * Result type returned by useEntity hook.
 */
export interface UseEntityResult<TRow, TCreate = unknown, TUpdate = unknown> {
  /** The synced data array */
  data: TRow[];
  /** Whether the initial sync is still loading */
  isLoading: boolean;
  /** Sync error if one occurred */
  error: SyncError | null;
  /** Function to retry after an error */
  retry: () => void;
  /** Insert a new entity (optimistic), returns entity and persistence promise */
  insert: (data: TCreate) => InsertResult<TRow>;
  /** Update an entity by ID (optimistic), returns persistence promise */
  update: (id: string, changes: Partial<TUpdate>) => MutationResult;
  /** Delete an entity by ID (optimistic), returns persistence promise */
  remove: (id: string) => MutationResult;
}

/**
 * Options for the useEntity hook.
 */
export interface UseEntityOptions {
  /**
   * Whether to enable the Electric sync subscription.
   * When false, returns empty data and no-op mutation functions.
   * Similar to React Query's `enabled` option.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Unified hook for entity data sync + optimistic mutations.
 *
 * Combines Electric real-time sync with TanStack DB's built-in
 * optimistic update support. When you call insert/update/remove:
 * 1. The change is immediately applied optimistically
 * 2. The API request is made in the background
 * 3. Electric syncs the real data, replacing optimistic state
 * 4. If the API fails, optimistic state is automatically rolled back
 *
 * @param entity - The entity definition from shared/remote-types.ts
 * @param params - URL parameters matching the entity's shape requirements
 * @param options - Optional configuration (enabled, etc.)
 *
 * @example
 * const { data, isLoading, insert, update, remove } = useEntity(
 *   ISSUE_ENTITY,
 *   { project_id: projectId }
 * );
 *
 * // Create a new issue (instant optimistic update)
 * insert({ project_id, status_id, title: 'New Issue', ... });
 *
 * // Update an issue (instant optimistic update)
 * update(issueId, { title: 'Updated Title' });
 *
 * // Delete an issue (instant optimistic removal)
 * remove(issueId);
 */
export function useEntity<
  E extends EntityDefinition<Record<string, unknown>, unknown, unknown>,
>(
  entity: E,
  params: Record<string, string>,
  options: UseEntityOptions = {}
): UseEntityResult<EntityRowType<E>, EntityCreateType<E>, EntityUpdateType<E>> {
  const { enabled = true } = options;

  const [error, setError] = useState<SyncError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Access sync error context for global error aggregation (optional - works without provider)
  // Extract stable function references to avoid infinite loops
  // (the context value changes when errors change, but the functions are stable via useCallback)
  const syncErrorContext = useSyncErrorContext();
  const registerErrorFn = syncErrorContext?.registerError;
  const clearErrorFn = syncErrorContext?.clearError;

  const handleError = useCallback((err: SyncError) => setError(err), []);

  const retry = useCallback(() => {
    setError(null);
    setRetryKey((k) => k + 1);
  }, []);

  // Memoize params by serialized value to get stable reference
  const paramsKey = JSON.stringify(params);
  const stableParams = useMemo(
    () => JSON.parse(paramsKey) as Record<string, string>,
    [paramsKey]
  );

  // Generate stable stream ID for error registration
  const streamId = useMemo(
    () => `${entity.name}:${paramsKey}`,
    [entity.name, paramsKey]
  );

  // Register/clear errors with global context
  useEffect(() => {
    if (error && registerErrorFn) {
      registerErrorFn(streamId, entity.name, error, retry);
    } else if (!error && clearErrorFn) {
      clearErrorFn(streamId);
    }

    // Cleanup: clear error when component unmounts
    return () => {
      clearErrorFn?.(streamId);
    };
  }, [error, streamId, entity.name, retry, registerErrorFn, clearErrorFn]);

  // Create collection with mutation handlers - retryKey forces recreation on retry
  // When enabled changes from false to true, collection is recreated with fresh auth state
  const collection = useMemo(() => {
    if (!enabled) return null;
    const config = { onError: handleError };
    void retryKey; // Reference to force recreation on retry
    return createEntityCollection(entity, stableParams, config);
  }, [enabled, entity, handleError, retryKey, stableParams]);

  // Subscribe to Electric when enabled (collection exists)
  // When disabled, return undefined to use useLiveQuery's built-in disabled state
  const { data, isLoading: queryLoading } = useLiveQuery(
    (query) => (collection ? query.from({ item: collection }) : undefined),
    [collection]
  );

  // useLiveQuery returns data as flat objects directly, not wrapped in { item: {...} }
  // Return empty array while loading or when disabled
  const items = useMemo(() => {
    if (!enabled || !collection || !data || queryLoading) return [];
    return data as unknown as EntityRowType<E>[];
  }, [enabled, collection, data, queryLoading]);

  // When disabled, isLoading should be false (not waiting for data)
  const isLoading = enabled ? queryLoading : false;

  // Keep a ref to the latest items for lookup after persistence
  // This allows insert() to return the synced entity with server-generated fields
  const itemsRef = useRef<EntityRowType<E>[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Expose collection mutation methods with stable callbacks
  // Type assertion needed because TanStack DB collection types are complex
  // TanStack DB mutations return a Transaction with isPersisted.promise
  type TransactionResult = { isPersisted: { promise: Promise<void> } };
  type CollectionWithMutations = {
    insert: (data: unknown) => TransactionResult;
    update: (
      id: string,
      updater: (draft: Record<string, unknown>) => void
    ) => TransactionResult;
    delete: (id: string) => TransactionResult;
  };
  const typedCollection =
    collection as unknown as CollectionWithMutations | null;

  const insert = useCallback(
    (insertData: EntityCreateType<E>): InsertResult<EntityRowType<E>> => {
      // Auto-generate ID for optimistic inserts
      // TanStack DB requires client-generated IDs for stable optimistic rendering
      const dataWithId = {
        id: crypto.randomUUID(),
        ...(insertData as Record<string, unknown>),
      };
      if (!typedCollection) {
        // When disabled, return no-op result
        return {
          data: dataWithId as EntityRowType<E>,
          persisted: Promise.resolve(dataWithId as EntityRowType<E>),
        };
      }
      const tx = typedCollection.insert(dataWithId);
      return {
        data: dataWithId as EntityRowType<E>,
        persisted: tx.isPersisted.promise.then(() => {
          // After persistence confirmed, look up the synced entity with server-generated fields
          const synced = itemsRef.current.find(
            (item) => (item as { id: string }).id === dataWithId.id
          );
          return (synced ?? dataWithId) as EntityRowType<E>;
        }),
      };
    },
    [typedCollection]
  );

  const update = useCallback(
    (id: string, changes: Partial<EntityUpdateType<E>>): MutationResult => {
      if (!typedCollection) {
        // When disabled, return no-op result
        return { persisted: Promise.resolve() };
      }
      const tx = typedCollection.update(id, (draft: Record<string, unknown>) =>
        Object.assign(draft, changes)
      );
      return { persisted: tx.isPersisted.promise };
    },
    [typedCollection]
  );

  const remove = useCallback(
    (id: string): MutationResult => {
      if (!typedCollection) {
        // When disabled, return no-op result
        return { persisted: Promise.resolve() };
      }
      const tx = typedCollection.delete(id);
      return { persisted: tx.isPersisted.promise };
    },
    [typedCollection]
  );

  return {
    data: items,
    isLoading,
    error,
    retry,
    insert,
    update,
    remove,
  };
}
