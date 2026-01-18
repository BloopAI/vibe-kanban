import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from '@tanstack/react-db';
import { createElectricCollection } from './collections';
import type { ShapeDefinition, ShapeRowType } from 'shared/shapes';
import type { SyncError } from './types';

/**
 * Result type returned by useElectricCollection hook.
 */
export interface UseElectricCollectionResult<T> {
  /** The synced data array */
  data: T[];
  /** Whether the initial sync is still loading */
  isLoading: boolean;
  /** Sync error if one occurred */
  error: SyncError | null;
  /** Function to retry after an error */
  retry: () => void;
}

/**
 * Generic hook for any Electric collection shape.
 * Handles error state, loading state, and retry logic centrally.
 *
 * @param shape - The shape definition from shared/shapes.ts
 * @param params - URL parameters matching the shape's param requirements
 *
 * @example
 * const { data, isLoading, error, retry } = useElectricCollection(
 *   PROJECTS_SHAPE,
 *   { organization_id: orgId }
 * );
 */
export function useElectricCollection<S extends ShapeDefinition<unknown>>(
  shape: S,
  params: Record<string, string>
): UseElectricCollectionResult<ShapeRowType<S>> {
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

  // Create collection - retryKey forces recreation on retry
  const collection = useMemo(() => {
    const config = { onError: handleError };
    void retryKey; // Reference to force recreation on retry
    return createElectricCollection(shape, stableParams, config);
  }, [shape, handleError, retryKey, stableParams]);

  const { data, isLoading } = useLiveQuery((query) =>
    query.from({ item: collection })
  );

  const items = useMemo(() => {
    if (!data) return [];
    // Debug logging to investigate undefined items
    console.log('[useElectricCollection] shape:', shape.table);
    console.log('[useElectricCollection] raw data length:', data.length);
    console.log('[useElectricCollection] raw data:', data);
    if (data.length > 0) {
      console.log('[useElectricCollection] first row:', data[0]);
      console.log(
        '[useElectricCollection] first row keys:',
        Object.keys(data[0])
      );
    }
    const extracted = data.map(
      (row) => (row as { item: ShapeRowType<S> }).item
    );
    console.log('[useElectricCollection] extracted items:', extracted);
    const undefinedCount = extracted.filter((item) => item == null).length;
    if (undefinedCount > 0) {
      console.warn(
        `[useElectricCollection] ${undefinedCount} undefined items found in ${shape.table}`
      );
    }
    return extracted;
  }, [data, shape.table]);

  return { data: items, isLoading, error, retry };
}
