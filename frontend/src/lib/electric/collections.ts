import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';

import { tokenManager } from '../auth/tokenManager';
import { makeRequest, REMOTE_API_URL } from '@/lib/remoteApi';
import type { EntityDefinition, ShapeDefinition } from 'shared/remote-types';
import type { CollectionConfig, SyncError } from './types';

/**
 * Error handler with exponential backoff for debouncing repeated errors.
 * Prevents infinite error spam when server is unreachable.
 */
class ErrorHandler {
  private lastErrorTime = 0;
  private lastErrorMessage = '';
  private consecutiveErrors = 0;
  private readonly baseDebounceMs = 1000;
  private readonly maxDebounceMs = 30000; // Max 30 seconds between error reports

  /**
   * Check if this error should be reported (not debounced).
   * Uses exponential backoff for repeated errors.
   */
  shouldReport(message: string): boolean {
    const now = Date.now();
    const debounceMs = Math.min(
      this.baseDebounceMs * Math.pow(2, this.consecutiveErrors),
      this.maxDebounceMs
    );

    if (
      message === this.lastErrorMessage &&
      now - this.lastErrorTime < debounceMs
    ) {
      return false;
    }

    this.lastErrorTime = now;
    if (message === this.lastErrorMessage) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
      this.lastErrorMessage = message;
    }

    return true;
  }

  /** Reset error state (call when connection succeeds) */
  reset() {
    this.consecutiveErrors = 0;
    this.lastErrorMessage = '';
  }
}

/**
 * Create a fetch wrapper that catches network errors and reports them.
 * Note: Debouncing is handled by the onError callback, not here.
 */
function createErrorHandlingFetch(
  errorHandler: ErrorHandler,
  onError?: (error: SyncError) => void
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    try {
      const response = await fetch(input, init);
      // Reset error state on successful response
      errorHandler.reset();
      return response;
    } catch (error) {
      // Always pass network errors to onError (debouncing happens there)
      const message = error instanceof Error ? error.message : 'Network error';
      onError?.({ message });
      throw error;
    }
  };
}

/**
 * Substitute URL parameters in a path template.
 * e.g., "/shape/project/{project_id}/issues" with { project_id: "123" }
 * becomes "/shape/project/123/issues"
 */
function buildUrl(baseUrl: string, params: Record<string, string>): string {
  let url = baseUrl;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(`{${key}}`, encodeURIComponent(value));
  }
  return url;
}

/**
 * Auto-detect the primary key for a row.
 * - If entity has an 'id' field, use it
 * - Otherwise, concatenate all *_id fields (for junction tables)
 */
function getRowKey(item: Record<string, unknown>): string {
  // Most entities have an 'id' field as primary key
  if ('id' in item && item.id) {
    return String(item.id);
  }
  // Junction tables (IssueAssignee, IssueTag, etc.) don't have 'id'
  // Use all *_id fields concatenated
  return Object.entries(item)
    .filter(([key]) => key.endsWith('_id'))
    .sort(([a], [b]) => a.localeCompare(b)) // Consistent ordering
    .map(([, value]) => String(value))
    .join('-');
}

/**
 * Get authenticated shape options for an Electric shape.
 * Includes error handling with exponential backoff and custom fetch wrapper.
 * Registers with tokenManager for pause/resume during token refresh.
 */
function getAuthenticatedShapeOptions(
  shape: ShapeDefinition<unknown>,
  params: Record<string, string>,
  config?: CollectionConfig
) {
  const url = buildUrl(shape.url, params);

  // Create error handler for this shape's lifecycle
  const errorHandler = new ErrorHandler();

  // Track pause state during token refresh
  let isPaused = false;

  // Register with tokenManager for pause/resume during token refresh.
  // This prevents 401 spam when multiple shapes hit auth errors simultaneously.
  tokenManager.registerShape({
    pause: () => {
      isPaused = true;
    },
    resume: () => {
      isPaused = false;
      // Clear error state to allow clean retry after refresh
      errorHandler.reset();
    },
  });

  // Single debounced error reporter for both network and Electric errors
  const reportError = (error: SyncError) => {
    if (errorHandler.shouldReport(error.message)) {
      // Only log to console when tab is visible - transient errors during
      // tab switches are expected and will auto-clear on visibility change
      if (document.visibilityState === 'visible') {
        console.error('Electric sync error:', error);
      }
      config?.onError?.(error);
    }
  };

  return {
    url: `${REMOTE_API_URL}${url}`,
    params,
    headers: {
      Authorization: async () => {
        const token = await tokenManager.getToken();
        return token ? `Bearer ${token}` : '';
      },
    },
    parser: {
      timestamptz: (value: string) => value,
    },
    // Custom fetch wrapper to catch network-level errors
    fetchClient: createErrorHandlingFetch(errorHandler, reportError),
    // Electric's onError callback (for non-network errors like 4xx/5xx responses)
    onError: (error: { status?: number; message?: string; name?: string }) => {
      // Ignore errors while paused (expected during token refresh)
      if (isPaused) return;

      // Ignore abort errors - these are expected during navigation/unmounting
      // DOMException with name 'AbortError' is thrown when fetch() is aborted
      if (error.name === 'AbortError') return;

      const status = error.status;
      const message = error.message || String(error);

      // Handle 401 by triggering token refresh
      if (status === 401) {
        tokenManager.triggerRefresh().catch(() => {
          // Refresh failed - report the original 401 error
          reportError({ status, message });
        });
        return;
      }

      reportError({ status, message });
    },
  };
}

// Row type with index signature required by Electric
type ElectricRow = Record<string, unknown> & { [key: string]: unknown };

/**
 * Create an Electric collection for an entity with mutation support.
 *
 * Adds `onInsert`, `onUpdate`, and `onDelete` handlers that call the remote API
 * and support optimistic updates.
 *
 * When you call `collection.insert()`, `collection.update()`, or `collection.delete()`:
 * 1. The optimistic state is immediately applied locally
 * 2. The mutation handler calls the remote API in the background
 * 3. Electric syncs the real data from Postgres, replacing optimistic state
 * 4. If the handler throws, optimistic state is automatically rolled back
 *
 * @param entity - The entity definition from shared/remote-types.ts
 * @param params - URL parameters matching the entity's shape requirements
 * @param config - Optional configuration (error handlers, etc.)
 *
 * @example
 * const collection = createEntityCollection(ISSUE_ENTITY, { project_id: '123' });
 * collection.insert({ project_id: '123', title: 'New Issue', ... }); // Optimistic
 */
export function createEntityCollection<
  TRow extends ElectricRow,
  TCreate,
  TUpdate,
>(
  entity: EntityDefinition<TRow, TCreate, TUpdate>,
  params: Record<string, string>,
  config?: CollectionConfig
) {
  if (!entity.shape) {
    throw new Error(`Entity ${entity.name} does not have a shape defined`);
  }

  const collectionId = `${entity.table}-${Object.values(params).join('-')}`;
  const shapeOptions = getAuthenticatedShapeOptions(
    entity.shape,
    params,
    config
  );

  // Build mutation handlers if entity supports mutations
  //
  // Handlers return { txid: number[] } to allow Electric to wait for the
  // transaction to be synced before resolving. This is more reliable than
  // awaitMatch which was previously used.
  type MutationFnParams = {
    transaction: {
      mutations: Array<{
        modified?: unknown; // For inserts - the new data
        original?: unknown; // For updates/deletes - the original item
        key?: string; // The ID/key of the item
        changes?: unknown; // For updates - the changed fields
      }>;
    };
  };

  const mutationHandlers = entity.mutations
    ? {
        onInsert: async ({
          transaction,
        }: MutationFnParams): Promise<{ txid: number[] }> => {
          const results = await Promise.all(
            transaction.mutations.map(async (mutation) => {
              const data = mutation.modified as Record<string, unknown>;
              const response = await makeRequest(entity.mutations!.url, {
                method: 'POST',
                body: JSON.stringify(data),
              });
              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  error.message || `Failed to create ${entity.name}`
                );
              }
              const result = (await response.json()) as { txid: number };
              return result.txid;
            })
          );
          return { txid: results };
        },
        onUpdate: async ({
          transaction,
        }: MutationFnParams): Promise<{ txid: number[] }> => {
          const results = await Promise.all(
            transaction.mutations.map(async (mutation) => {
              const { key, changes } = mutation;
              const response = await makeRequest(
                `${entity.mutations!.url}/${key}`,
                {
                  method: 'PATCH',
                  body: JSON.stringify(changes),
                }
              );
              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  error.message || `Failed to update ${entity.name}`
                );
              }
              const result = (await response.json()) as { txid: number };
              return result.txid;
            })
          );
          return { txid: results };
        },
        onDelete: async ({
          transaction,
        }: MutationFnParams): Promise<{ txid: number[] }> => {
          const results = await Promise.all(
            transaction.mutations.map(async (mutation) => {
              const { key } = mutation;
              const response = await makeRequest(
                `${entity.mutations!.url}/${key}`,
                {
                  method: 'DELETE',
                }
              );
              if (!response.ok) {
                const error = await response.json();
                throw new Error(
                  error.message || `Failed to delete ${entity.name}`
                );
              }
              const result = (await response.json()) as { txid: number };
              return result.txid;
            })
          );
          return { txid: results };
        },
      }
    : {};

  // Type assertion needed because the specific return types for mutation handlers
  // ({ txid: number[] }) need to be compatible with electricCollectionOptions.
  type ElectricConfig = Parameters<typeof electricCollectionOptions>[0];
  const options = electricCollectionOptions({
    id: collectionId,
    shapeOptions: shapeOptions as unknown as ElectricConfig['shapeOptions'],
    getKey: (item: ElectricRow) => getRowKey(item),
    ...mutationHandlers,
  } as unknown as ElectricConfig);

  return createCollection(options) as unknown as ReturnType<
    typeof createCollection
  > & {
    __rowType?: TRow;
    __createType?: TCreate;
    __updateType?: TUpdate;
  };
}
