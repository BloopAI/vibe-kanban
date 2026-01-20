import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';

/**
 * Type guard to check if a message is a change message from Electric sync.
 * Change messages have a `headers` object with an `operation` field.
 */
function isChangeMessage(
  msg: unknown
): msg is { headers: { operation: string }; value: Record<string, unknown> } {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.headers !== 'object' || m.headers === null) return false;
  const headers = m.headers as Record<string, unknown>;
  return typeof headers.operation === 'string';
}
import { oauthApi } from '../api';
import { makeRequest, REMOTE_API_URL } from '@/lib/remoteApi';
import type { EntityDefinition, ShapeDefinition } from 'shared/remote-types';
import type { CollectionConfig, SyncError } from './types';

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
 */
function getAuthenticatedShapeOptions(
  shape: ShapeDefinition<unknown>,
  params: Record<string, string>,
  config?: CollectionConfig
) {
  const url = buildUrl(shape.url, params);

  return {
    url: `${REMOTE_API_URL}/v1${url}`,
    params,
    headers: {
      Authorization: async () => {
        const tokenResponse = await oauthApi.getToken();
        return tokenResponse ? `Bearer ${tokenResponse.access_token}` : '';
      },
    },
    parser: {
      timestamptz: (value: string) => value,
    },
    onError: (error: { status?: number; message?: string }) => {
      console.error('Electric sync error:', error);
      const status = error.status;
      const message = error.message || String(error);
      config?.onError?.({ status, message } as SyncError);
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
  // Handlers use `collection.utils.awaitMatch` to wait for the synced data
  // to arrive from Electric before resolving. This prevents flicker where
  // the optimistic state gets replaced by synced state.
  type MutationFnParams = {
    transaction: {
      mutations: Array<{
        modified?: unknown; // For inserts - the new data
        original?: unknown; // For updates/deletes - the original item
        key?: string; // The ID/key of the item
        changes?: unknown; // For updates - the changed fields
      }>;
    };
    collection: {
      utils: {
        awaitMatch: (
          matchFn: (msg: unknown) => boolean,
          timeout?: number
        ) => Promise<boolean>;
      };
    };
  };

  const mutationHandlers = entity.mutations
    ? {
        onInsert: async ({
          transaction,
          collection,
        }: MutationFnParams): Promise<void> => {
          const data = transaction.mutations[0].modified as Record<
            string,
            unknown
          >;
          const response = await makeRequest(`/v1${entity.mutations!.url}`, {
            method: 'POST',
            body: JSON.stringify(data),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `Failed to create ${entity.name}`);
          }
          // Wait for the synced row to arrive using ID matching
          const key = getRowKey(data);
          await collection.utils.awaitMatch((msg: unknown) => {
            if (!isChangeMessage(msg)) return false;
            const changeMsg = msg as {
              value: Record<string, unknown>;
              headers: { operation: string };
            };
            return (
              changeMsg.headers.operation === 'insert' &&
              getRowKey(changeMsg.value) === key
            );
          }, 5000);
        },
        onUpdate: async ({
          transaction,
          collection,
        }: MutationFnParams): Promise<void> => {
          const { key, changes } = transaction.mutations[0];
          const response = await makeRequest(
            `/v1${entity.mutations!.url}/${key}`,
            {
              method: 'PATCH',
              body: JSON.stringify(changes),
            }
          );
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `Failed to update ${entity.name}`);
          }
          // Wait for the synced update
          await collection.utils.awaitMatch((msg: unknown) => {
            if (!isChangeMessage(msg)) return false;
            const changeMsg = msg as {
              value: Record<string, unknown>;
              headers: { operation: string };
            };
            return (
              changeMsg.headers.operation === 'update' &&
              getRowKey(changeMsg.value) === key
            );
          }, 5000);
        },
        onDelete: async ({
          transaction,
          collection,
        }: MutationFnParams): Promise<void> => {
          const { key } = transaction.mutations[0];
          const response = await makeRequest(
            `/v1${entity.mutations!.url}/${key}`,
            {
              method: 'DELETE',
            }
          );
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `Failed to delete ${entity.name}`);
          }
          // Wait for the synced delete
          await collection.utils.awaitMatch((msg: unknown) => {
            if (!isChangeMessage(msg)) return false;
            const changeMsg = msg as {
              value: Record<string, unknown>;
              headers: { operation: string };
            };
            return (
              changeMsg.headers.operation === 'delete' &&
              getRowKey(changeMsg.value) === key
            );
          }, 5000);
        },
      }
    : {};

  // Type assertion needed because our MutationFnParams includes Electric-specific
  // utils (awaitMatch) that the base @tanstack/db types don't know about.
  // The actual runtime behavior is correct - electricCollectionOptions adds these utils.
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
