/**
 * Electric SDK - Type-safe collections for real-time data sync.
 *
 * Usage:
 * ```typescript
 * import { createProjectsCollection, SyncError } from '@/lib/electric';
 *
 * const collection = createProjectsCollection(organizationId, {
 *   onError: (error) => console.error('Sync failed:', error.message),
 * });
 * ```
 */

// Types
export type { SyncError, CollectionConfig } from './types';

// Generic factory (for advanced usage)
export { createElectricCollection, getRowKey, buildUrl } from './collections';

// Typed convenience functions
export {
  // Organization-scoped
  createProjectsCollection,
  createNotificationsCollection,
  // Project-scoped
  createWorkspacesCollection,
  createProjectStatusesCollection,
  createTagsCollection,
  createIssuesCollection,
  createIssueAssigneesCollection,
  createIssueFollowersCollection,
  createIssueTagsCollection,
  createIssueDependenciesCollection,
  // Issue-scoped
  createIssueCommentsCollection,
  createIssueCommentReactionsCollection,
} from './sdk';

// Re-export shapes for advanced usage
export * from 'shared/shapes';
