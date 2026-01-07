import { BaseCollectionConfig, CollectionConfig, InferSchemaOutput, PendingMutation, UtilsRecord } from './types.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
/**
 * Storage API interface - subset of DOM Storage that we need
 */
export type StorageApi = Pick<Storage, `getItem` | `setItem` | `removeItem`>;
/**
 * Storage event API - subset of Window for 'storage' events only
 */
export type StorageEventApi = {
    addEventListener: (type: `storage`, listener: (event: StorageEvent) => void) => void;
    removeEventListener: (type: `storage`, listener: (event: StorageEvent) => void) => void;
};
export interface Parser {
    parse: (data: string) => unknown;
    stringify: (data: unknown) => string;
}
/**
 * Configuration interface for localStorage collection options
 * @template T - The type of items in the collection
 * @template TSchema - The schema type for validation
 * @template TKey - The type of the key returned by `getKey`
 */
export interface LocalStorageCollectionConfig<T extends object = object, TSchema extends StandardSchemaV1 = never, TKey extends string | number = string | number> extends BaseCollectionConfig<T, TKey, TSchema> {
    /**
     * The key to use for storing the collection data in localStorage/sessionStorage
     */
    storageKey: string;
    /**
     * Storage API to use (defaults to window.localStorage)
     * Can be any object that implements the Storage interface (e.g., sessionStorage)
     */
    storage?: StorageApi;
    /**
     * Storage event API to use for cross-tab synchronization (defaults to window)
     * Can be any object that implements addEventListener/removeEventListener for storage events
     */
    storageEventApi?: StorageEventApi;
    /**
     * Parser to use for serializing and deserializing data to and from storage
     * Defaults to JSON
     */
    parser?: Parser;
}
/**
 * Type for the clear utility function
 */
export type ClearStorageFn = () => void;
/**
 * Type for the getStorageSize utility function
 */
export type GetStorageSizeFn = () => number;
/**
 * LocalStorage collection utilities type
 */
export interface LocalStorageCollectionUtils extends UtilsRecord {
    clearStorage: ClearStorageFn;
    getStorageSize: GetStorageSizeFn;
    /**
     * Accepts mutations from a transaction that belong to this collection and persists them to localStorage.
     * This should be called in your transaction's mutationFn to persist local-storage data.
     *
     * @param transaction - The transaction containing mutations to accept
     * @example
     * const localSettings = createCollection(localStorageCollectionOptions({...}))
     *
     * const tx = createTransaction({
     *   mutationFn: async ({ transaction }) => {
     *     // Make API call first
     *     await api.save(...)
     *     // Then persist local-storage mutations after success
     *     localSettings.utils.acceptMutations(transaction)
     *   }
     * })
     */
    acceptMutations: (transaction: {
        mutations: Array<PendingMutation<Record<string, unknown>>>;
    }) => void;
}
/**
 * Creates localStorage collection options for use with a standard Collection
 *
 * This function creates a collection that persists data to localStorage/sessionStorage
 * and synchronizes changes across browser tabs using storage events.
 *
 * **Fallback Behavior:**
 *
 * When localStorage is not available (e.g., in server-side rendering environments),
 * this function automatically falls back to an in-memory storage implementation.
 * This prevents errors during module initialization and allows the collection to
 * work in any environment, though data will not persist across page reloads or
 * be shared across tabs when using the in-memory fallback.
 *
 * **Using with Manual Transactions:**
 *
 * For manual transactions, you must call `utils.acceptMutations()` in your transaction's `mutationFn`
 * to persist changes made during `tx.mutate()`. This is necessary because local-storage collections
 * don't participate in the standard mutation handler flow for manual transactions.
 *
 * @template TExplicit - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 * @param config - Configuration options for the localStorage collection
 * @returns Collection options with utilities including clearStorage, getStorageSize, and acceptMutations
 *
 * @example
 * // Basic localStorage collection
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * @example
 * // localStorage collection with custom storage
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     storage: window.sessionStorage, // Use sessionStorage instead
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * @example
 * // localStorage collection with mutation handlers
 * const collection = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'todos',
 *     getKey: (item) => item.id,
 *     onInsert: async ({ transaction }) => {
 *       console.log('Item inserted:', transaction.mutations[0].modified)
 *     },
 *   })
 * )
 *
 * @example
 * // Using with manual transactions
 * const localSettings = createCollection(
 *   localStorageCollectionOptions({
 *     storageKey: 'user-settings',
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * const tx = createTransaction({
 *   mutationFn: async ({ transaction }) => {
 *     // Use settings data in API call
 *     const settingsMutations = transaction.mutations.filter(m => m.collection === localSettings)
 *     await api.updateUserProfile({ settings: settingsMutations[0]?.modified })
 *
 *     // Persist local-storage mutations after API success
 *     localSettings.utils.acceptMutations(transaction)
 *   }
 * })
 *
 * tx.mutate(() => {
 *   localSettings.insert({ id: 'theme', value: 'dark' })
 *   apiCollection.insert({ id: 2, data: 'profile data' })
 * })
 *
 * await tx.commit()
 */
export declare function localStorageCollectionOptions<T extends StandardSchemaV1, TKey extends string | number = string | number>(config: LocalStorageCollectionConfig<InferSchemaOutput<T>, T, TKey> & {
    schema: T;
}): CollectionConfig<InferSchemaOutput<T>, TKey, T, LocalStorageCollectionUtils> & {
    id: string;
    utils: LocalStorageCollectionUtils;
    schema: T;
};
export declare function localStorageCollectionOptions<T extends object, TKey extends string | number = string | number>(config: LocalStorageCollectionConfig<T, never, TKey> & {
    schema?: never;
}): CollectionConfig<T, TKey, never, LocalStorageCollectionUtils> & {
    id: string;
    utils: LocalStorageCollectionUtils;
    schema?: never;
};
