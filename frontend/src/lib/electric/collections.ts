import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';

import { tokenManager } from '../auth/tokenManager';
import { makeRequest, getRemoteApiUrl } from '@/lib/remoteApi';
import type { MutationDefinition, ShapeDefinition } from 'shared/remote-types';
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

const SHAPE_NON_LIVE_TIMEOUT_MS = 5000;
const SHAPE_LIVE_TIMEOUT_MS = 25000;

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function getShapeRequestTimeoutMs(input: RequestInfo | URL): number {
  try {
    const requestUrl = getRequestUrl(input);
    const live = new URL(requestUrl, 'http://localhost').searchParams.get(
      'live'
    );
    return live === 'true' ? SHAPE_LIVE_TIMEOUT_MS : SHAPE_NON_LIVE_TIMEOUT_MS;
  } catch {
    return SHAPE_NON_LIVE_TIMEOUT_MS;
  }
}

/**
 * Create a fetch wrapper that catches network errors and reports them.
 * When isPaused returns true (during token refresh or after logout),
 * requests are aborted to prevent 401 spam from cached Electric shapes.
 * Note: Debouncing is handled by the onError callback, not here.
 */
function createErrorHandlingFetch(
  errorHandler: ErrorHandler,
  onError?: (error: SyncError) => void,
  isPaused?: () => boolean
) {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    // Abort requests while paused (logged out or refreshing token).
    // This prevents cached Electric shapes from sending unauthenticated
    // requests that would trigger 401s and login dialog prompts.
    if (isPaused?.()) {
      throw new DOMException(
        'Shape request aborted: not authenticated',
        'AbortError'
      );
    }

    const timeoutMs = getShapeRequestTimeoutMs(input);
    const timeoutAbortController = new AbortController();
    const sourceSignal = init?.signal;
    const handleSourceAbort = () => {
      timeoutAbortController.abort(sourceSignal?.reason);
    };
    if (sourceSignal) {
      if (sourceSignal.aborted) {
        timeoutAbortController.abort(sourceSignal.reason);
      } else {
        sourceSignal.addEventListener('abort', handleSourceAbort, {
          once: true,
        });
      }
    }
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutAbortController.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: timeoutAbortController.signal,
      });
      // Reset error state on successful response
      errorHandler.reset();
      return response;
    } catch (error) {
      if (didTimeout) {
        const timeoutError = new Error(
          `Shape request timed out after ${timeoutMs}ms`
        );
        timeoutError.name = 'TimeoutError';
        onError?.({ message: timeoutError.message });
        throw timeoutError;
      }

      // Always pass network errors to onError (debouncing happens there)
      const message = error instanceof Error ? error.message : 'Network error';
      onError?.({ message });
      throw error;
    } finally {
      clearTimeout(timeoutId);
      if (sourceSignal) {
        sourceSignal.removeEventListener('abort', handleSourceAbort);
      }
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
 * - If row has an 'id' field, use it
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

  // Track pause state during token refresh or logout
  let isPaused = false;

  // Register with tokenManager for pause/resume during token refresh.
  // This prevents 401 spam when multiple shapes hit auth errors simultaneously.
  // Shapes are also paused on logout and resumed on login.
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
    url: `${getRemoteApiUrl()}${url}`,
    params,
    headers: {
      Authorization: async () => {
        const token = await tokenManager.getToken();
        if (!token) {
          // No token means user is logged out — pause this shape so the
          // fetchClient aborts the request instead of sending it without auth.
          isPaused = true;
          return '';
        }
        return `Bearer ${token}`;
      },
    },
    parser: {
      timestamptz: (value: string) => value,
    },
    // Custom fetch wrapper to catch network-level errors.
    // Aborts requests while paused (during token refresh or after logout).
    fetchClient: createErrorHandlingFetch(
      errorHandler,
      reportError,
      () => isPaused
    ),
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

// Module-level cache for collections to avoid recreating on every mount.
// Key: collectionId (e.g. "issues-proj123"), Value: the collection instance
const collectionCache = new Map<string, ReturnType<typeof createCollection>>();

// Default gcTime: 5 minutes (in ms). Keeps collection data alive after unmount.
const DEFAULT_GC_TIME_MS = 5 * 60 * 1000;

/**
 * Build a stable collection ID from table name and params.
 * Sorts param keys for consistency regardless of insertion order.
 * Adds `-mut` suffix for mutation-enabled collections to avoid cache conflicts.
 */
function buildCollectionId(
  table: string,
  params: Record<string, string>,
  hasMutations: boolean = false
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => params[k])
    .join('-');
  const base = sortedParams ? `${table}-${sortedParams}` : table;
  return hasMutations ? `${base}-mut` : base;
}

// Type assertion needed because the specific return types for mutation handlers
// ({ txid: number[] }) need to be compatible with electricCollectionOptions.
type ElectricConfig = Parameters<typeof electricCollectionOptions>[0];

type ShapeSyncError = { status?: number; message?: string; name?: string };
type ElectricShapeOptions = {
  onError?: (error: ShapeSyncError) => void;
  fetchClient?: (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<Response>;
  [key: string]: unknown;
};

type FallbackWrappedOptions = {
  sync: {
    sync: (params: {
      begin: (options?: { immediate?: boolean }) => void;
      write: (message: unknown) => void;
      commit: () => void;
      truncate: () => void;
      markReady: () => void;
      [key: string]: unknown;
    }) => unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type CoreFallbackDefinition = {
  table: 'projects' | 'project_statuses' | 'issues';
  path: '/v1/projects' | '/v1/project_statuses' | '/v1/issues';
  queryParam: 'organization_id' | 'project_id';
  responseField: 'projects' | 'project_statuses' | 'issues';
};

type CoreFallbackSyncBridge = {
  begin: (options?: { immediate?: boolean }) => void;
  write: (message: { type: 'insert'; value: ElectricRow }) => void;
  commit: () => void;
  truncate: () => void;
  markReady: () => void;
};

const CORE_FALLBACK_RETRY_MS = 5000;

const CORE_FALLBACKS: Record<string, CoreFallbackDefinition> = {
  projects: {
    table: 'projects',
    path: '/v1/projects',
    queryParam: 'organization_id',
    responseField: 'projects',
  },
  project_statuses: {
    table: 'project_statuses',
    path: '/v1/project_statuses',
    queryParam: 'project_id',
    responseField: 'project_statuses',
  },
  issues: {
    table: 'issues',
    path: '/v1/issues',
    queryParam: 'project_id',
    responseField: 'issues',
  },
};

function getCoreFallbackDefinition(
  table: string,
  params: Record<string, string>
): CoreFallbackDefinition | null {
  const fallback = CORE_FALLBACKS[table];
  if (!fallback) return null;
  const queryValue = params[fallback.queryParam];
  if (!queryValue) return null;
  return fallback;
}

function shouldUseCoreFallback(error: ShapeSyncError): boolean {
  if (error.name === 'AbortError') return false;
  if (error.status === 401 || error.status === 403) return false;
  return true;
}

async function fetchCoreFallbackRows(
  fallback: CoreFallbackDefinition,
  params: Record<string, string>
): Promise<ElectricRow[]> {
  const queryValue = params[fallback.queryParam];
  if (!queryValue) return [];

  const query = new URLSearchParams({ [fallback.queryParam]: queryValue });
  const response = await makeRequest(`${fallback.path}?${query.toString()}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(
      `Fallback list failed for ${fallback.table} (${response.status})`
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const rows = payload[fallback.responseField];
  if (!Array.isArray(rows)) {
    throw new Error(
      `Fallback list for ${fallback.table} returned unexpected payload`
    );
  }

  return rows as ElectricRow[];
}

function createCoreFallbackController(
  fallback: CoreFallbackDefinition,
  params: Record<string, string>,
  collectionId: string,
  config?: CollectionConfig
) {
  let syncBridge: CoreFallbackSyncBridge | null = null;
  let hasHydrated = false;
  let fallbackInFlight: Promise<void> | null = null;
  let lastAttemptAt = 0;

  const hydrateFromFallback = async () => {
    if (!syncBridge || hasHydrated) return;

    const rows = await fetchCoreFallbackRows(fallback, params);
    syncBridge.begin({ immediate: true });
    syncBridge.truncate();
    for (const row of rows) {
      syncBridge.write({ type: 'insert', value: row });
    }
    syncBridge.commit();
    syncBridge.markReady();
    hasHydrated = true;
  };

  const triggerFallback = () => {
    const now = Date.now();
    if (hasHydrated) return;
    if (fallbackInFlight) return;
    if (now - lastAttemptAt < CORE_FALLBACK_RETRY_MS) return;

    lastAttemptAt = now;
    fallbackInFlight = hydrateFromFallback()
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : 'Fallback request failed';
        console.error(
          `[${collectionId}] Electric fallback failed (${fallback.table}):`,
          error
        );
        config?.onError?.({ message });
      })
      .finally(() => {
        fallbackInFlight = null;
      });
  };

  const wrapShapeOptions = (shapeOptions: ElectricShapeOptions) => {
    const options = shapeOptions as ElectricShapeOptions;
    const baseOnError = options.onError;
    const baseFetchClient = options.fetchClient;

    return {
      ...options,
      fetchClient: baseFetchClient
        ? async (input: RequestInfo | URL, init?: RequestInit) => {
            try {
              const response = await baseFetchClient(input, init);
              if (
                !response.ok &&
                shouldUseCoreFallback({ status: response.status })
              ) {
                triggerFallback();
              }
              return response;
            } catch (error) {
              const shapeError = {
                name:
                  error instanceof Error
                    ? error.name
                    : error instanceof DOMException
                      ? error.name
                      : undefined,
              };
              if (shouldUseCoreFallback(shapeError)) {
                triggerFallback();
              }
              throw error;
            }
          }
        : undefined,
      onError: (error: ShapeSyncError) => {
        if (shouldUseCoreFallback(error)) {
          triggerFallback();
        }
        baseOnError?.(error);
      },
    };
  };

  const attachSyncWrapper = (collectionOptions: FallbackWrappedOptions) => {
    const baseSyncFn = collectionOptions.sync.sync;
    collectionOptions.sync.sync = (syncParams) => {
      syncBridge = {
        begin: syncParams.begin,
        write: (message) => syncParams.write(message),
        commit: syncParams.commit,
        truncate: syncParams.truncate,
        markReady: syncParams.markReady,
      };
      return baseSyncFn(syncParams);
    };
  };

  return { wrapShapeOptions, attachSyncWrapper };
}

/**
 * Create an Electric collection for a shape, optionally with mutation support.
 *
 * When `mutation` is provided, adds `onInsert`, `onUpdate`, and `onDelete` handlers
 * that call the remote API and support optimistic updates via TanStack DB.
 *
 * @param shape - The shape definition from shared/remote-types.ts
 * @param params - URL parameters matching the shape's requirements
 * @param config - Optional configuration (error handlers, etc.)
 * @param mutation - Optional mutation definition to enable insert/update/delete
 */
export function createShapeCollection<TRow extends ElectricRow>(
  shape: ShapeDefinition<TRow>,
  params: Record<string, string>,
  config?: CollectionConfig,
  mutation?: MutationDefinition<unknown, unknown, unknown>
) {
  const hasMutations = !!mutation;
  const collectionId = buildCollectionId(shape.table, params, hasMutations);

  const cached = collectionCache.get(collectionId);
  if (cached) {
    return cached as typeof cached & { __rowType?: TRow };
  }

  const fallbackDefinition = getCoreFallbackDefinition(shape.table, params);
  const fallbackController = fallbackDefinition
    ? createCoreFallbackController(
        fallbackDefinition,
        params,
        collectionId,
        config
      )
    : null;

  const baseShapeOptions = getAuthenticatedShapeOptions(
    shape,
    params,
    config
  ) as ElectricShapeOptions;
  const shapeOptions = fallbackController
    ? fallbackController.wrapShapeOptions(baseShapeOptions)
    : baseShapeOptions;
  const mutationHandlers = mutation ? buildMutationHandlers(mutation) : {};

  const electricOptions = electricCollectionOptions({
    id: collectionId,
    shapeOptions: shapeOptions as unknown as ElectricConfig['shapeOptions'],
    getKey: (item: ElectricRow) => getRowKey(item),
    gcTime: DEFAULT_GC_TIME_MS,
    ...mutationHandlers,
  } as unknown as ElectricConfig);
  if (fallbackController) {
    fallbackController.attachSyncWrapper(
      electricOptions as unknown as FallbackWrappedOptions
    );
  }

  const collection = createCollection(electricOptions) as unknown as ReturnType<
    typeof createCollection
  > & { __rowType?: TRow };

  collectionCache.set(collectionId, collection);
  return collection;
}

type MutationFnParams = {
  transaction: {
    mutations: Array<{
      modified?: unknown;
      original?: unknown;
      key?: string;
      changes?: unknown;
    }>;
  };
};

/**
 * Build mutation handlers (onInsert/onUpdate/onDelete) for a mutation definition.
 * Handlers call the remote API and return { txid } for Electric sync tracking.
 */
function buildMutationHandlers(
  mutation: MutationDefinition<unknown, unknown, unknown>
) {
  return {
    onInsert: async ({
      transaction,
    }: MutationFnParams): Promise<{ txid: number[] }> => {
      const results = await Promise.all(
        transaction.mutations.map(async (m) => {
          const data = m.modified as Record<string, unknown>;
          const response = await makeRequest(mutation.url, {
            method: 'POST',
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(
              error.message || `Failed to create ${mutation.name}`
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
      if (transaction.mutations.length > 1) {
        const updates = transaction.mutations.map((m) => {
          if (!m.key) {
            throw new Error(`Failed to update ${mutation.name}: missing key`);
          }
          return {
            id: String(m.key),
            ...(m.changes as Record<string, unknown>),
          };
        });

        const response = await makeRequest(`${mutation.url}/bulk`, {
          method: 'POST',
          body: JSON.stringify({ updates }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(
            error.message || `Failed to bulk update ${mutation.name}`
          );
        }
        const result = (await response.json()) as { txid: number };
        return { txid: [result.txid] };
      }

      const mutationItem = transaction.mutations[0];
      if (!mutationItem?.key) {
        throw new Error(`Failed to update ${mutation.name}: missing key`);
      }

      const response = await makeRequest(
        `${mutation.url}/${mutationItem.key}`,
        {
          method: 'PATCH',
          body: JSON.stringify(mutationItem.changes),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to update ${mutation.name}`);
      }
      const result = (await response.json()) as { txid: number };
      return { txid: [result.txid] };
    },
    onDelete: async ({
      transaction,
    }: MutationFnParams): Promise<{ txid: number[] }> => {
      const results = await Promise.all(
        transaction.mutations.map(async (m) => {
          const { key } = m;
          const response = await makeRequest(`${mutation.url}/${key}`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(
              error.message || `Failed to delete ${mutation.name}`
            );
          }
          const result = (await response.json()) as { txid: number };
          return result.txid;
        })
      );
      return { txid: results };
    },
  };
}
