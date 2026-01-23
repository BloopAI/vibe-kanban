import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { createEntityCollection } from './collections';
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
  /** Insert a new entity (optimistic) */
  insert: (data: TCreate) => void;
  /** Update an entity by ID (optimistic) */
  update: (id: string, changes: Partial<TUpdate>) => void;
  /** Delete an entity by ID (optimistic) */
  remove: (id: string) => void;
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
  params: Record<string, string>
): UseEntityResult<EntityRowType<E>, EntityCreateType<E>, EntityUpdateType<E>> {
  const [error, setError] = useState<SyncError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

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

  // Create collection with mutation handlers - retryKey forces recreation on retry
  const collection = useMemo(() => {
    const config = { onError: handleError };
    void retryKey; // Reference to force recreation on retry
    return createEntityCollection(entity, stableParams, config);
  }, [entity, handleError, retryKey, stableParams]);

  const { data, isLoading } = useLiveQuery(
    (query) => query.from({ item: collection }),
    [collection]
  );

  // useLiveQuery returns data as flat objects directly, not wrapped in { item: {...} }
  // Return empty array while loading to avoid showing stale data during collection transitions
  const items = useMemo(() => {
    if (!data || isLoading) return [];
    return data as unknown as EntityRowType<E>[];
  }, [data, isLoading]);

  // Expose collection mutation methods with stable callbacks
  // Type assertion needed because TanStack DB collection types are complex
  type CollectionWithMutations = {
    insert: (data: unknown) => void;
    update: (
      id: string,
      updater: (draft: Record<string, unknown>) => void
    ) => void;
    delete: (id: string) => void;
  };
  const typedCollection = collection as unknown as CollectionWithMutations;

  const insert = useCallback(
    (insertData: EntityCreateType<E>) => {
      // Auto-generate ID for optimistic inserts
      // TanStack DB requires client-generated IDs for stable optimistic rendering
      const dataWithId = {
        id: crypto.randomUUID(),
        ...(insertData as Record<string, unknown>),
      };
      typedCollection.insert(dataWithId);
    },
    [typedCollection]
  );

  const update = useCallback(
    (id: string, changes: Partial<EntityUpdateType<E>>) => {
      typedCollection.update(id, (draft: Record<string, unknown>) =>
        Object.assign(draft, changes)
      );
    },
    [typedCollection]
  );

  const remove = useCallback(
    (id: string) => {
      typedCollection.delete(id);
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
