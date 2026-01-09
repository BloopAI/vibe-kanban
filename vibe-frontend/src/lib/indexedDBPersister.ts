import { get, set, del } from 'idb-keyval';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

const CACHE_KEY = 'vibe-kanban-query-cache';
const CACHE_VERSION = 1;

interface PersistedData {
  version: number;
  timestamp: number;
  client: PersistedClient;
}

/**
 * Creates a TanStack Query persister that uses IndexedDB via idb-keyval.
 * This allows the query cache to survive page refreshes and browser restarts.
 */
export function createIndexedDBPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        const data: PersistedData = {
          version: CACHE_VERSION,
          timestamp: Date.now(),
          client,
        };
        await set(CACHE_KEY, data);
      } catch (error) {
        // Silently fail on quota errors or other storage issues
        // The app will still work, just without persistence
        console.warn('[IndexedDB Persister] Failed to persist cache:', error);
      }
    },

    restoreClient: async (): Promise<PersistedClient | undefined> => {
      try {
        const data = await get<PersistedData>(CACHE_KEY);

        if (!data) {
          return undefined;
        }

        // Version mismatch - clear old cache
        if (data.version !== CACHE_VERSION) {
          console.info('[IndexedDB Persister] Cache version mismatch, clearing old cache');
          await del(CACHE_KEY);
          return undefined;
        }

        // Check if cache is too old (24 hours)
        const maxAge = 24 * 60 * 60 * 1000;
        if (Date.now() - data.timestamp > maxAge) {
          console.info('[IndexedDB Persister] Cache expired, clearing');
          await del(CACHE_KEY);
          return undefined;
        }

        return data.client;
      } catch (error) {
        console.warn('[IndexedDB Persister] Failed to restore cache:', error);
        return undefined;
      }
    },

    removeClient: async () => {
      try {
        await del(CACHE_KEY);
      } catch (error) {
        console.warn('[IndexedDB Persister] Failed to remove cache:', error);
      }
    },
  };
}

/**
 * Manually clear the persisted cache.
 * Useful for logout or cache invalidation.
 */
export async function clearPersistedCache(): Promise<void> {
  try {
    await del(CACHE_KEY);
  } catch (error) {
    console.warn('[IndexedDB Persister] Failed to clear cache:', error);
  }
}
