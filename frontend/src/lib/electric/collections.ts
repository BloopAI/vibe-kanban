import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { createCollection } from '@tanstack/react-db';
import { oauthApi } from '../api';
import { REMOTE_API_URL } from '@/lib/remoteApi';
import type { ShapeDefinition } from 'shared/remote-types';
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

// Row type with index signature required by Electric
type ElectricRow = Record<string, unknown> & { [key: string]: unknown };

/**
 * Create an Electric collection for a shape with the given row type.
 *
 * Note: The Electric library has strict generic constraints that are
 * difficult to satisfy with dynamic shape options. We use type assertions
 * to bridge the gap between our runtime-correct values and the library's
 * static type requirements.
 */
export function createElectricCollection<T extends ElectricRow = ElectricRow>(
  shape: ShapeDefinition<unknown>,
  params: Record<string, string>,
  config?: CollectionConfig
) {
  const collectionId = `${shape.table}-${Object.values(params).join('-')}`;
  const shapeOptions = getAuthenticatedShapeOptions(shape, params, config);

  // Electric library requires specific type shapes that are difficult to satisfy
  // when building options dynamically. We cast through unknown to bridge the gap.
  const options = electricCollectionOptions({
    id: collectionId,
    shapeOptions: shapeOptions as unknown as Parameters<
      typeof electricCollectionOptions
    >[0]['shapeOptions'],
    getKey: (item: ElectricRow) => getRowKey(item),
  });

  return createCollection(options) as unknown as ReturnType<
    typeof createCollection
  > & { __rowType?: T };
}
