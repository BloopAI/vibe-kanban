import { BaseCollectionConfig, CollectionConfig, DeleteMutationFnParams, InsertMutationFnParams, SyncMode, UpdateMutationFnParams, UtilsRecord } from '@tanstack/db';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { GetExtensions, Message, Row, ShapeStreamOptions } from '@electric-sql/client';
export { isChangeMessage, isControlMessage } from '@electric-sql/client';
/**
 * Symbol for internal test hooks (hidden from public API)
 */
export declare const ELECTRIC_TEST_HOOKS: unique symbol;
/**
 * Internal test hooks interface (for testing only)
 */
export interface ElectricTestHooks {
    /**
     * Called before marking collection ready after first up-to-date in progressive mode
     * Allows tests to pause and validate snapshot phase before atomic swap completes
     */
    beforeMarkingReady?: () => Promise<void>;
}
/**
 * Type representing a transaction ID in ElectricSQL
 */
export type Txid = number;
/**
 * Custom match function type - receives stream messages and returns boolean
 * indicating if the mutation has been synchronized
 */
export type MatchFunction<T extends Row<unknown>> = (message: Message<T>) => boolean;
/**
 * Matching strategies for Electric synchronization
 * Handlers can return:
 * - Txid strategy: { txid: number | number[], timeout?: number } (recommended)
 * - Void (no return value) - mutation completes without waiting
 *
 * The optional timeout property specifies how long to wait for the txid(s) in milliseconds.
 * If not specified, defaults to 5000ms.
 */
export type MatchingStrategy = {
    txid: Txid | Array<Txid>;
    timeout?: number;
} | void;
type InferSchemaOutput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> extends Row<unknown> ? StandardSchemaV1.InferOutput<T> : Record<string, unknown> : Record<string, unknown>;
/**
 * The mode of sync to use for the collection.
 * @default `eager`
 * @description
 * - `eager`:
 *   - syncs all data immediately on preload
 *   - collection will be marked as ready once the sync is complete
 *   - there is no incremental sync
 * - `on-demand`:
 *   - syncs data in incremental snapshots when the collection is queried
 *   - collection will be marked as ready immediately after the first snapshot is synced
 * - `progressive`:
 *   - syncs all data for the collection in the background
 *   - uses incremental snapshots during the initial sync to provide a fast path to the data required for queries
 *   - collection will be marked as ready once the full sync is complete
 */
export type ElectricSyncMode = SyncMode | `progressive`;
/**
 * Configuration interface for Electric collection options
 * @template T - The type of items in the collection
 * @template TSchema - The schema type for validation
 */
export interface ElectricCollectionConfig<T extends Row<unknown> = Row<unknown>, TSchema extends StandardSchemaV1 = never> extends Omit<BaseCollectionConfig<T, string | number, TSchema, ElectricCollectionUtils<T>, any>, `onInsert` | `onUpdate` | `onDelete` | `syncMode`> {
    /**
     * Configuration options for the ElectricSQL ShapeStream
     */
    shapeOptions: ShapeStreamOptions<GetExtensions<T>>;
    syncMode?: ElectricSyncMode;
    /**
     * Internal test hooks (for testing only)
     * Hidden via Symbol to prevent accidental usage in production
     */
    [ELECTRIC_TEST_HOOKS]?: ElectricTestHooks;
    /**
     * Optional asynchronous handler function called before an insert operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to { txid, timeout? } or void
     * @example
     * // Basic Electric insert handler with txid (recommended)
     * onInsert: async ({ transaction }) => {
     *   const newItem = transaction.mutations[0].modified
     *   const result = await api.todos.create({
     *     data: newItem
     *   })
     *   return { txid: result.txid }
     * }
     *
     * @example
     * // Insert handler with custom timeout
     * onInsert: async ({ transaction }) => {
     *   const newItem = transaction.mutations[0].modified
     *   const result = await api.todos.create({
     *     data: newItem
     *   })
     *   return { txid: result.txid, timeout: 10000 } // Wait up to 10 seconds
     * }
     *
     * @example
     * // Insert handler with multiple items - return array of txids
     * onInsert: async ({ transaction }) => {
     *   const items = transaction.mutations.map(m => m.modified)
     *   const results = await Promise.all(
     *     items.map(item => api.todos.create({ data: item }))
     *   )
     *   return { txid: results.map(r => r.txid) }
     * }
     *
     * @example
     * // Use awaitMatch utility for custom matching
     * onInsert: async ({ transaction, collection }) => {
     *   const newItem = transaction.mutations[0].modified
     *   await api.todos.create({ data: newItem })
     *   await collection.utils.awaitMatch(
     *     (message) => isChangeMessage(message) &&
     *                  message.headers.operation === 'insert' &&
     *                  message.value.name === newItem.name
     *   )
     * }
     */
    onInsert?: (params: InsertMutationFnParams<T, string | number, ElectricCollectionUtils<T>>) => Promise<MatchingStrategy>;
    /**
     * Optional asynchronous handler function called before an update operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to { txid, timeout? } or void
     * @example
     * // Basic Electric update handler with txid (recommended)
     * onUpdate: async ({ transaction }) => {
     *   const { original, changes } = transaction.mutations[0]
     *   const result = await api.todos.update({
     *     where: { id: original.id },
     *     data: changes
     *   })
     *   return { txid: result.txid }
     * }
     *
     * @example
     * // Use awaitMatch utility for custom matching
     * onUpdate: async ({ transaction, collection }) => {
     *   const { original, changes } = transaction.mutations[0]
     *   await api.todos.update({ where: { id: original.id }, data: changes })
     *   await collection.utils.awaitMatch(
     *     (message) => isChangeMessage(message) &&
     *                  message.headers.operation === 'update' &&
     *                  message.value.id === original.id
     *   )
     * }
     */
    onUpdate?: (params: UpdateMutationFnParams<T, string | number, ElectricCollectionUtils<T>>) => Promise<MatchingStrategy>;
    /**
     * Optional asynchronous handler function called before a delete operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to { txid, timeout? } or void
     * @example
     * // Basic Electric delete handler with txid (recommended)
     * onDelete: async ({ transaction }) => {
     *   const mutation = transaction.mutations[0]
     *   const result = await api.todos.delete({
     *     id: mutation.original.id
     *   })
     *   return { txid: result.txid }
     * }
     *
     * @example
     * // Use awaitMatch utility for custom matching
     * onDelete: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   await api.todos.delete({ id: mutation.original.id })
     *   await collection.utils.awaitMatch(
     *     (message) => isChangeMessage(message) &&
     *                  message.headers.operation === 'delete' &&
     *                  message.value.id === mutation.original.id
     *   )
     * }
     */
    onDelete?: (params: DeleteMutationFnParams<T, string | number, ElectricCollectionUtils<T>>) => Promise<MatchingStrategy>;
}
/**
 * Type for the awaitTxId utility function
 */
export type AwaitTxIdFn = (txId: Txid, timeout?: number) => Promise<boolean>;
/**
 * Type for the awaitMatch utility function
 */
export type AwaitMatchFn<T extends Row<unknown>> = (matchFn: MatchFunction<T>, timeout?: number) => Promise<boolean>;
/**
 * Electric collection utilities type
 */
export interface ElectricCollectionUtils<T extends Row<unknown> = Row<unknown>> extends UtilsRecord {
    awaitTxId: AwaitTxIdFn;
    awaitMatch: AwaitMatchFn<T>;
}
/**
 * Creates Electric collection options for use with a standard Collection
 *
 * @template T - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 * @param config - Configuration options for the Electric collection
 * @returns Collection options with utilities
 */
export declare function electricCollectionOptions<T extends StandardSchemaV1>(config: ElectricCollectionConfig<InferSchemaOutput<T>, T> & {
    schema: T;
}): Omit<CollectionConfig<InferSchemaOutput<T>, string | number, T>, `utils`> & {
    id?: string;
    utils: ElectricCollectionUtils<InferSchemaOutput<T>>;
    schema: T;
};
export declare function electricCollectionOptions<T extends Row<unknown>>(config: ElectricCollectionConfig<T> & {
    schema?: never;
}): Omit<CollectionConfig<T, string | number>, `utils`> & {
    id?: string;
    utils: ElectricCollectionUtils<T>;
    schema?: never;
};
