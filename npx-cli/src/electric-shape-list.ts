declare const require: any;

const { electricCollectionOptions } = require('@tanstack/electric-db-collection');
const { createCollection, createLiveQueryCollection } = require('@tanstack/db');

let nextCollectionId = 0;

function buildCollectionId(table: string) {
  nextCollectionId += 1;
  return `remote-mcp-${table}-${nextCollectionId}`;
}

function buildShapeUrl(remoteBaseUrl: string, shapePath: string) {
  return new URL(shapePath, `${remoteBaseUrl}/`).toString();
}

function getRowKey(row: Record<string, unknown>) {
  if (Object.prototype.hasOwnProperty.call(row, 'id') && row.id) {
    return String(row.id);
  }

  return Object.entries(row)
    .filter(([key]) => key.endsWith('_id'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => String(value))
    .join('-');
}

function unwrapQueryRows(rows: any[]) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return row;
    }

    if (Object.prototype.hasOwnProperty.call(row, 'item')) {
      return row.item;
    }

    return row;
  });
}

async function safeCleanup(collection: any) {
  if (!collection || typeof collection.cleanup !== 'function') {
    return;
  }

  try {
    await collection.cleanup();
  } catch {
    // Ignore cleanup errors so they do not hide the original request failure.
  }
}

export async function listShapeRows(options: {
  table: string;
  remoteBaseUrl: string;
  shapePath: string;
  queryParams: Record<string, string>;
  fetchAuthToken: () => Promise<string>;
}) {
  const { table, remoteBaseUrl, shapePath, queryParams, fetchAuthToken } =
    options;
  const collectionId = buildCollectionId(table);
  const shapeOptions = {
    url: buildShapeUrl(remoteBaseUrl, shapePath),
    params: queryParams,
    headers: {
      Authorization: async () => {
        const token = await fetchAuthToken();
        return `Bearer ${token}`;
      },
    },
    parser: {
      timestamptz: (value: string) => value,
    },
  };

  const baseCollection = createCollection(
    electricCollectionOptions({
      id: collectionId,
      shapeOptions,
      getKey: getRowKey,
    })
  );
  const queryCollection = createLiveQueryCollection((query: any) =>
    query.from({ item: baseCollection })
  );

  try {
    const rows = await queryCollection.toArrayWhenReady();
    return unwrapQueryRows(Array.isArray(rows) ? rows : []);
  } finally {
    await safeCleanup(queryCollection);
    await safeCleanup(baseCollection);
  }
}
