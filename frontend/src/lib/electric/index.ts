/**
 * Electric SDK - Type-safe collections for real-time data sync.
 *
 * Usage (read-only sync):
 * ```typescript
 * import { useElectricCollection } from '@/lib/electric';
 * import { PROJECTS_SHAPE } from 'shared/remote-types';
 *
 * const { data, isLoading, error, retry } = useElectricCollection(
 *   PROJECTS_SHAPE,
 *   { organization_id: orgId }
 * );
 * ```
 *
 * Usage (sync + optimistic mutations):
 * ```typescript
 * import { useEntity } from '@/lib/electric';
 * import { ISSUE_ENTITY } from 'shared/remote-types';
 *
 * const { data, isLoading, insert, update, remove } = useEntity(
 *   ISSUE_ENTITY,
 *   { project_id: projectId }
 * );
 *
 * // Create (instant optimistic update)
 * insert({ project_id, status_id, title: 'New Issue', ... });
 *
 * // Update (instant optimistic update)
 * update(issueId, { title: 'Updated Title' });
 *
 * // Delete (instant optimistic removal)
 * remove(issueId);
 * ```
 */

// Types
export type { SyncError, CollectionConfig } from './types';
export type { UseElectricCollectionResult, UseEntityResult } from './hooks';

// Hooks
export { useElectricCollection, useEntity } from './hooks';

// Generic factories (for advanced usage)
export {
  createElectricCollection,
  createEntityCollection,
  getRowKey,
  buildUrl,
} from './collections';

// Re-export shapes and entities for convenience
export * from 'shared/remote-types';
