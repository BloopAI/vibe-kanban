import { BaseCollectionConfig, CollectionConfig, InferSchemaOutput, PendingMutation, UtilsRecord } from './types.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
/**
 * Configuration interface for Local-only collection options
 * @template T - The type of items in the collection
 * @template TSchema - The schema type for validation
 * @template TKey - The type of the key returned by `getKey`
 */
export interface LocalOnlyCollectionConfig<T extends object = object, TSchema extends StandardSchemaV1 = never, TKey extends string | number = string | number> extends Omit<BaseCollectionConfig<T, TKey, TSchema, LocalOnlyCollectionUtils>, `gcTime` | `startSync`> {
    /**
     * Optional initial data to populate the collection with on creation
     * This data will be applied during the initial sync process
     */
    initialData?: Array<T>;
}
/**
 * Local-only collection utilities type
 */
export interface LocalOnlyCollectionUtils extends UtilsRecord {
    /**
     * Accepts mutations from a transaction that belong to this collection and persists them.
     * This should be called in your transaction's mutationFn to persist local-only data.
     *
     * @param transaction - The transaction containing mutations to accept
     * @example
     * const localData = createCollection(localOnlyCollectionOptions({...}))
     *
     * const tx = createTransaction({
     *   mutationFn: async ({ transaction }) => {
     *     // Make API call first
     *     await api.save(...)
     *     // Then persist local-only mutations after success
     *     localData.utils.acceptMutations(transaction)
     *   }
     * })
     */
    acceptMutations: (transaction: {
        mutations: Array<PendingMutation<Record<string, unknown>>>;
    }) => void;
}
type LocalOnlyCollectionOptionsResult<T extends object, TKey extends string | number, TSchema extends StandardSchemaV1 | never = never> = CollectionConfig<T, TKey, TSchema> & {
    utils: LocalOnlyCollectionUtils;
};
/**
 * Creates Local-only collection options for use with a standard Collection
 *
 * This is an in-memory collection that doesn't sync with external sources but uses a loopback sync config
 * that immediately "syncs" all optimistic changes to the collection, making them permanent.
 * Perfect for local-only data that doesn't need persistence or external synchronization.
 *
 * **Using with Manual Transactions:**
 *
 * For manual transactions, you must call `utils.acceptMutations()` in your transaction's `mutationFn`
 * to persist changes made during `tx.mutate()`. This is necessary because local-only collections
 * don't participate in the standard mutation handler flow for manual transactions.
 *
 * @template T - The schema type if a schema is provided, otherwise the type of items in the collection
 * @template TKey - The type of the key returned by getKey
 * @param config - Configuration options for the Local-only collection
 * @returns Collection options with utilities including acceptMutations
 *
 * @example
 * // Basic local-only collection
 * const collection = createCollection(
 *   localOnlyCollectionOptions({
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * @example
 * // Local-only collection with initial data
 * const collection = createCollection(
 *   localOnlyCollectionOptions({
 *     getKey: (item) => item.id,
 *     initialData: [
 *       { id: 1, name: 'Item 1' },
 *       { id: 2, name: 'Item 2' },
 *     ],
 *   })
 * )
 *
 * @example
 * // Local-only collection with mutation handlers
 * const collection = createCollection(
 *   localOnlyCollectionOptions({
 *     getKey: (item) => item.id,
 *     onInsert: async ({ transaction }) => {
 *       console.log('Item inserted:', transaction.mutations[0].modified)
 *       // Custom logic after insert
 *     },
 *   })
 * )
 *
 * @example
 * // Using with manual transactions
 * const localData = createCollection(
 *   localOnlyCollectionOptions({
 *     getKey: (item) => item.id,
 *   })
 * )
 *
 * const tx = createTransaction({
 *   mutationFn: async ({ transaction }) => {
 *     // Use local data in API call
 *     const localMutations = transaction.mutations.filter(m => m.collection === localData)
 *     await api.save({ metadata: localMutations[0]?.modified })
 *
 *     // Persist local-only mutations after API success
 *     localData.utils.acceptMutations(transaction)
 *   }
 * })
 *
 * tx.mutate(() => {
 *   localData.insert({ id: 1, data: 'metadata' })
 *   apiCollection.insert({ id: 2, data: 'main data' })
 * })
 *
 * await tx.commit()
 */
export declare function localOnlyCollectionOptions<T extends StandardSchemaV1, TKey extends string | number = string | number>(config: LocalOnlyCollectionConfig<InferSchemaOutput<T>, T, TKey> & {
    schema: T;
}): LocalOnlyCollectionOptionsResult<InferSchemaOutput<T>, TKey, T> & {
    schema: T;
};
export declare function localOnlyCollectionOptions<T extends object, TKey extends string | number = string | number>(config: LocalOnlyCollectionConfig<T, never, TKey> & {
    schema?: never;
}): LocalOnlyCollectionOptionsResult<T, TKey> & {
    schema?: never;
};
export {};
