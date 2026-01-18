import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';
import { oauthApi } from '../api';
import { REMOTE_API_URL } from '@/lib/remoteApi';
import type { ShapeDefinition } from 'shared/shapes';
import type { CollectionConfig, SyncError } from './types';

/**
 * Substitute URL parameters in a path template.
 * e.g., "/shape/project/{project_id}/issues" with { project_id: "123" }
 * becomes "/shape/project/123/issues"
 */
export function buildUrl(
  baseUrl: string,
  params: Record<string, string>
): string {
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
export function getRowKey(item: Record<string, unknown>): string {
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
export function getAuthenticatedShapeOptions(
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

/**
 * Create an Electric collection for a shape with the given row type.
 * The row type must have an index signature for compatibility with Electric.
 */
export function createElectricCollection<
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  shape: ShapeDefinition<unknown>,
  params: Record<string, string>,
  config?: CollectionConfig
) {
  const collectionId = `${shape.table}-${Object.values(params).join('-')}`;
  const shapeOptions = getAuthenticatedShapeOptions(shape, params, config);

  // Use type assertion to bypass strict type checking from Electric library
  // Our shape options are compatible at runtime
  return createCollection(
    electricCollectionOptions<T>({
      id: collectionId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shapeOptions: shapeOptions as any,
      getKey: (item) => getRowKey(item),
    })
  );
}
