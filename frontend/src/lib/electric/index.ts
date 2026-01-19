/**
 * Electric SDK - Type-safe collections for real-time data sync.
 *
 * Usage:
 * ```typescript
 * import { useElectricCollection } from '@/lib/electric';
 * import { PROJECTS_SHAPE } from 'shared/remote-types';
 *
 * const { data, isLoading, error, retry } = useElectricCollection(
 *   PROJECTS_SHAPE,
 *   { organization_id: orgId }
 * );
 * ```
 */

// Types
export type { SyncError, CollectionConfig } from './types';
export type { UseElectricCollectionResult } from './hooks';

// Generic hook (recommended for most use cases)
export { useElectricCollection } from './hooks';

// Generic factory (for advanced usage)
export { createElectricCollection, getRowKey, buildUrl } from './collections';

// Re-export shapes for convenience
export * from 'shared/remote-types';
