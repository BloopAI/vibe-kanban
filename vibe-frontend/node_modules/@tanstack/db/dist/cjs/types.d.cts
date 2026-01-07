import { IStreamBuilder } from '@tanstack/db-ivm';
import { Collection } from './collection/index.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { Transaction } from './transactions.cjs';
import { BasicExpression, OrderBy } from './query/ir.js';
import { EventEmitter } from './event-emitter.js';
/**
 * Interface for a collection-like object that provides the necessary methods
 * for the change events system to work
 */
export interface CollectionLike<T extends object = Record<string, unknown>, TKey extends string | number = string | number> extends Pick<Collection<T, TKey>, `get` | `has` | `entries` | `indexes` | `id` | `compareOptions`> {
}
/**
 * StringSortOpts - Options for string sorting behavior
 *
 * This discriminated union allows for two types of string sorting:
 * - **Lexical**: Simple character-by-character comparison (default)
 * - **Locale**: Locale-aware sorting with optional customization
 *
 * The union ensures that locale options are only available when locale sorting is selected.
 */
export type StringCollationConfig = {
    stringSort?: `lexical`;
} | {
    stringSort?: `locale`;
    locale?: string;
    localeOptions?: object;
};
/**
 * Helper type to extract the output type from a standard schema
 *
 * @internal This is used by the type resolution system
 */
export type InferSchemaOutput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> extends object ? StandardSchemaV1.InferOutput<T> : Record<string, unknown> : Record<string, unknown>;
/**
 * Helper type to extract the input type from a standard schema
 *
 * @internal This is used for collection insert type inference
 */
export type InferSchemaInput<T> = T extends StandardSchemaV1 ? StandardSchemaV1.InferInput<T> extends object ? StandardSchemaV1.InferInput<T> : Record<string, unknown> : Record<string, unknown>;
export type TransactionState = `pending` | `persisting` | `completed` | `failed`;
/**
 * Represents a utility function that can be attached to a collection
 */
export type Fn = (...args: Array<any>) => any;
/**
 * A record of utilities (functions or getters) that can be attached to a collection
 */
export type UtilsRecord = Record<string, any>;
/**
 *
 * @remarks `update` and `insert` are both represented as `Partial<T>`, but changes for `insert` could me made more precise by inferring the schema input type. In practice, this has almost 0 real world impact so it's not worth the added type complexity.
 *
 * @see  https://github.com/TanStack/db/pull/209#issuecomment-3053001206
 */
export type ResolveTransactionChanges<T extends object = Record<string, unknown>, TOperation extends OperationType = OperationType> = TOperation extends `delete` ? T : Partial<T>;
/**
 * Represents a pending mutation within a transaction
 * Contains information about the original and modified data, as well as metadata
 */
export interface PendingMutation<T extends object = Record<string, unknown>, TOperation extends OperationType = OperationType, TCollection extends Collection<T, any, any, any, any> = Collection<T, any, any, any, any>> {
    mutationId: string;
    original: TOperation extends `insert` ? {} : T;
    modified: T;
    changes: ResolveTransactionChanges<T, TOperation>;
    globalKey: string;
    key: any;
    type: TOperation;
    metadata: unknown;
    syncMetadata: Record<string, unknown>;
    /** Whether this mutation should be applied optimistically (defaults to true) */
    optimistic: boolean;
    createdAt: Date;
    updatedAt: Date;
    collection: TCollection;
}
/**
 * Configuration options for creating a new transaction
 */
export type MutationFnParams<T extends object = Record<string, unknown>> = {
    transaction: TransactionWithMutations<T>;
};
export type MutationFn<T extends object = Record<string, unknown>> = (params: MutationFnParams<T>) => Promise<any>;
/**
 * Represents a non-empty array (at least one element)
 */
export type NonEmptyArray<T> = [T, ...Array<T>];
/**
 * Utility type for a Transaction with at least one mutation
 * This is used internally by the Transaction.commit method
 */
export type TransactionWithMutations<T extends object = Record<string, unknown>, TOperation extends OperationType = OperationType> = Omit<Transaction<T>, `mutations`> & {
    /**
     * We must omit the `mutations` property from `Transaction<T>` before intersecting
     * because TypeScript intersects property types when the same property appears on
     * both sides of an intersection.
     *
     * Without `Omit`:
     * - `Transaction<T>` has `mutations: Array<PendingMutation<T>>`
     * - The intersection would create: `Array<PendingMutation<T>> & NonEmptyArray<PendingMutation<T, TOperation>>`
     * - When mapping over this array, TypeScript widens `TOperation` from the specific literal
     *   (e.g., `"delete"`) to the union `OperationType` (`"insert" | "update" | "delete"`)
     * - This causes `PendingMutation<T, OperationType>` to evaluate the conditional type
     *   `original: TOperation extends 'insert' ? {} : T` as `{} | T` instead of just `T`
     *
     * With `Omit`:
     * - We remove `mutations` from `Transaction<T>` first
     * - Then add back `mutations: NonEmptyArray<PendingMutation<T, TOperation>>`
     * - TypeScript can properly narrow `TOperation` to the specific literal type
     * - This ensures `mutation.original` is correctly typed as `T` (not `{} | T`) when mapping
     */
    mutations: NonEmptyArray<PendingMutation<T, TOperation>>;
};
export interface TransactionConfig<T extends object = Record<string, unknown>> {
    /** Unique identifier for the transaction */
    id?: string;
    autoCommit?: boolean;
    mutationFn: MutationFn<T>;
    /** Custom metadata to associate with the transaction */
    metadata?: Record<string, unknown>;
}
/**
 * Options for the createOptimisticAction helper
 */
export interface CreateOptimisticActionsOptions<TVars = unknown, T extends object = Record<string, unknown>> extends Omit<TransactionConfig<T>, `mutationFn`> {
    /** Function to apply optimistic updates locally before the mutation completes */
    onMutate: (vars: TVars) => void;
    /** Function to execute the mutation on the server */
    mutationFn: (vars: TVars, params: MutationFnParams<T>) => Promise<any>;
}
export type { Transaction };
type Value<TExtensions = never> = string | number | boolean | bigint | null | TExtensions | Array<Value<TExtensions>> | {
    [key: string | number | symbol]: Value<TExtensions>;
};
export type Row<TExtensions = never> = Record<string, Value<TExtensions>>;
export type OperationType = `insert` | `update` | `delete`;
/**
 * Subscription status values
 */
export type SubscriptionStatus = `ready` | `loadingSubset`;
/**
 * Event emitted when subscription status changes
 */
export interface SubscriptionStatusChangeEvent {
    type: `status:change`;
    subscription: Subscription;
    previousStatus: SubscriptionStatus;
    status: SubscriptionStatus;
}
/**
 * Event emitted when subscription status changes to a specific status
 */
export interface SubscriptionStatusEvent<T extends SubscriptionStatus> {
    type: `status:${T}`;
    subscription: Subscription;
    previousStatus: SubscriptionStatus;
    status: T;
}
/**
 * Event emitted when subscription is unsubscribed
 */
export interface SubscriptionUnsubscribedEvent {
    type: `unsubscribed`;
    subscription: Subscription;
}
/**
 * All subscription events
 */
export type SubscriptionEvents = {
    'status:change': SubscriptionStatusChangeEvent;
    'status:ready': SubscriptionStatusEvent<`ready`>;
    'status:loadingSubset': SubscriptionStatusEvent<`loadingSubset`>;
    unsubscribed: SubscriptionUnsubscribedEvent;
};
/**
 * Public interface for a collection subscription
 * Used by sync implementations to track subscription lifecycle
 */
export interface Subscription extends EventEmitter<SubscriptionEvents> {
    /** Current status of the subscription */
    readonly status: SubscriptionStatus;
}
/**
 * Cursor expressions for pagination, passed separately from the main `where` clause.
 * The sync layer can choose to use cursor-based pagination (combining these with the where)
 * or offset-based pagination (ignoring these and using the `offset` parameter).
 *
 * Neither expression includes the main `where` clause - they are cursor-specific only.
 */
export type CursorExpressions = {
    /**
     * Expression for rows greater than (after) the cursor value.
     * For multi-column orderBy, this is a composite cursor using OR of conditions.
     * Example for [col1 ASC, col2 DESC] with values [v1, v2]:
     *   or(gt(col1, v1), and(eq(col1, v1), lt(col2, v2)))
     */
    whereFrom: BasicExpression<boolean>;
    /**
     * Expression for rows equal to the current cursor value (first orderBy column only).
     * Used to handle tie-breaking/duplicates at the boundary.
     * Example: eq(col1, v1) or for Dates: and(gte(col1, v1), lt(col1, v1+1ms))
     */
    whereCurrent: BasicExpression<boolean>;
    /**
     * The key of the last item that was loaded.
     * Can be used by sync layers for tracking or deduplication.
     */
    lastKey?: string | number;
};
export type LoadSubsetOptions = {
    /** The where expression to filter the data (does NOT include cursor expressions) */
    where?: BasicExpression<boolean>;
    /** The order by clause to sort the data */
    orderBy?: OrderBy;
    /** The limit of the data to load */
    limit?: number;
    /**
     * Cursor expressions for cursor-based pagination.
     * These are separate from `where` - the sync layer should combine them if using cursor-based pagination.
     * Neither expression includes the main `where` clause.
     */
    cursor?: CursorExpressions;
    /**
     * Row offset for offset-based pagination.
     * The sync layer can use this instead of `cursor` if it prefers offset-based pagination.
     */
    offset?: number;
    /**
     * The subscription that triggered the load.
     * Advanced sync implementations can use this for:
     * - LRU caching keyed by subscription
     * - Reference counting to track active subscriptions
     * - Subscribing to subscription events (e.g., finalization/unsubscribe)
     * @optional Available when called from CollectionSubscription, may be undefined for direct calls
     */
    subscription?: Subscription;
};
export type LoadSubsetFn = (options: LoadSubsetOptions) => true | Promise<void>;
export type UnloadSubsetFn = (options: LoadSubsetOptions) => void;
export type CleanupFn = () => void;
export type SyncConfigRes = {
    cleanup?: CleanupFn;
    loadSubset?: LoadSubsetFn;
    unloadSubset?: UnloadSubsetFn;
};
export interface SyncConfig<T extends object = Record<string, unknown>, TKey extends string | number = string | number> {
    sync: (params: {
        collection: Collection<T, TKey, any, any, any>;
        begin: () => void;
        write: (message: ChangeMessageOrDeleteKeyMessage<T, TKey>) => void;
        commit: () => void;
        markReady: () => void;
        truncate: () => void;
    }) => void | CleanupFn | SyncConfigRes;
    /**
     * Get the sync metadata for insert operations
     * @returns Record containing relation information
     */
    getSyncMetadata?: () => Record<string, unknown>;
    /**
     * The row update mode used to sync to the collection.
     * @default `partial`
     * @description
     * - `partial`: Updates contain only the changes to the row.
     * - `full`: Updates contain the entire row.
     */
    rowUpdateMode?: `partial` | `full`;
}
export interface ChangeMessage<T extends object = Record<string, unknown>, TKey extends string | number = string | number> {
    key: TKey;
    value: T;
    previousValue?: T;
    type: OperationType;
    metadata?: Record<string, unknown>;
}
export type DeleteKeyMessage<TKey extends string | number = string | number> = Omit<ChangeMessage<any, TKey>, `value` | `previousValue` | `type`> & {
    type: `delete`;
};
export type ChangeMessageOrDeleteKeyMessage<T extends object = Record<string, unknown>, TKey extends string | number = string | number> = Omit<ChangeMessage<T>, `key`> | DeleteKeyMessage<TKey>;
export type OptimisticChangeMessage<T extends object = Record<string, unknown>, TKey extends string | number = string | number> = (ChangeMessage<T> & {
    isActive?: boolean;
}) | (DeleteKeyMessage<TKey> & {
    isActive?: boolean;
});
/**
 * The Standard Schema interface.
 * This follows the standard-schema specification: https://github.com/standard-schema/standard-schema
 */
export type StandardSchema<T> = StandardSchemaV1 & {
    '~standard': {
        types?: {
            input: T;
            output: T;
        };
    };
};
/**
 * Type alias for StandardSchema
 */
export type StandardSchemaAlias<T = unknown> = StandardSchema<T>;
export interface OperationConfig {
    metadata?: Record<string, unknown>;
    /** Whether to apply optimistic updates immediately. Defaults to true. */
    optimistic?: boolean;
}
export interface InsertConfig {
    metadata?: Record<string, unknown>;
    /** Whether to apply optimistic updates immediately. Defaults to true. */
    optimistic?: boolean;
}
export type UpdateMutationFnParams<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord> = {
    transaction: TransactionWithMutations<T, `update`>;
    collection: Collection<T, TKey, TUtils>;
};
export type InsertMutationFnParams<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord> = {
    transaction: TransactionWithMutations<T, `insert`>;
    collection: Collection<T, TKey, TUtils>;
};
export type DeleteMutationFnParams<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord> = {
    transaction: TransactionWithMutations<T, `delete`>;
    collection: Collection<T, TKey, TUtils>;
};
export type InsertMutationFn<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord, TReturn = any> = (params: InsertMutationFnParams<T, TKey, TUtils>) => Promise<TReturn>;
export type UpdateMutationFn<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord, TReturn = any> = (params: UpdateMutationFnParams<T, TKey, TUtils>) => Promise<TReturn>;
export type DeleteMutationFn<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord, TReturn = any> = (params: DeleteMutationFnParams<T, TKey, TUtils>) => Promise<TReturn>;
/**
 * Collection status values for lifecycle management
 * @example
 * // Check collection status
 * if (collection.status === "loading") {
 *   console.log("Collection is loading initial data")
 * } else if (collection.status === "ready") {
 *   console.log("Collection is ready for use")
 * }
 *
 * @example
 * // Status transitions
 * // idle → loading → ready (when markReady() is called)
 * // Any status can transition to → error or cleaned-up
 */
export type CollectionStatus = 
/** Collection is created but sync hasn't started yet (when startSync config is false) */
`idle`
/** Sync has started and is loading data */
 | `loading`
/** Collection has been explicitly marked ready via markReady() */
 | `ready`
/** An error occurred during sync initialization */
 | `error`
/** Collection has been cleaned up and resources freed */
 | `cleaned-up`;
export type SyncMode = `eager` | `on-demand`;
export interface BaseCollectionConfig<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = never, TUtils extends UtilsRecord = UtilsRecord, TReturn = any> {
    id?: string;
    schema?: TSchema;
    /**
     * Function to extract the ID from an object
     * This is required for update/delete operations which now only accept IDs
     * @param item The item to extract the ID from
     * @returns The ID string for the item
     * @example
     * // For a collection with a 'uuid' field as the primary key
     * getKey: (item) => item.uuid
     */
    getKey: (item: T) => TKey;
    /**
     * Time in milliseconds after which the collection will be garbage collected
     * when it has no active subscribers. Defaults to 5 minutes (300000ms).
     */
    gcTime?: number;
    /**
     * Whether to eagerly start syncing on collection creation.
     * When true, syncing begins immediately. When false, syncing starts when the first subscriber attaches.
     *
     * Note: Even with startSync=true, collections will pause syncing when there are no active
     * subscribers (typically when components querying the collection unmount), resuming when new
     * subscribers attach. This preserves normal staleTime/gcTime behavior.
     *
     * @default false
     */
    startSync?: boolean;
    /**
     * Auto-indexing mode for the collection.
     * When enabled, indexes will be automatically created for simple where expressions.
     * @default "eager"
     * @description
     * - "off": No automatic indexing
     * - "eager": Automatically create indexes for simple where expressions in subscribeChanges (default)
     */
    autoIndex?: `off` | `eager`;
    /**
     * Optional function to compare two items.
     * This is used to order the items in the collection.
     * @param x The first item to compare
     * @param y The second item to compare
     * @returns A number indicating the order of the items
     * @example
     * // For a collection with a 'createdAt' field
     * compare: (x, y) => x.createdAt.getTime() - y.createdAt.getTime()
     */
    compare?: (x: T, y: T) => number;
    /**
     * The mode of sync to use for the collection.
     * @default `eager`
     * @description
     * - `eager`: syncs all data immediately on preload
     * - `on-demand`: syncs data in incremental snapshots when the collection is queried
     * The exact implementation of the sync mode is up to the sync implementation.
     */
    syncMode?: SyncMode;
    /**
     * Optional asynchronous handler function called before an insert operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to any value
     * @example
     * // Basic insert handler
     * onInsert: async ({ transaction, collection }) => {
     *   const newItem = transaction.mutations[0].modified
     *   await api.createTodo(newItem)
     * }
     *
     * @example
     * // Insert handler with multiple items
     * onInsert: async ({ transaction, collection }) => {
     *   const items = transaction.mutations.map(m => m.modified)
     *   await api.createTodos(items)
     * }
     *
     * @example
     * // Insert handler with error handling
     * onInsert: async ({ transaction, collection }) => {
     *   try {
     *     const newItem = transaction.mutations[0].modified
     *     const result = await api.createTodo(newItem)
     *     return result
     *   } catch (error) {
     *     console.error('Insert failed:', error)
     *     throw error // This will cause the transaction to fail
     *   }
     * }
     *
     * @example
     * // Insert handler with metadata
     * onInsert: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   await api.createTodo(mutation.modified, {
     *     source: mutation.metadata?.source,
     *     timestamp: mutation.createdAt
     *   })
     * }
     */
    onInsert?: InsertMutationFn<T, TKey, TUtils, TReturn>;
    /**
     * Optional asynchronous handler function called before an update operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to any value
     * @example
     * // Basic update handler
     * onUpdate: async ({ transaction, collection }) => {
     *   const updatedItem = transaction.mutations[0].modified
     *   await api.updateTodo(updatedItem.id, updatedItem)
     * }
     *
     * @example
     * // Update handler with partial updates
     * onUpdate: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   const changes = mutation.changes // Only the changed fields
     *   await api.updateTodo(mutation.original.id, changes)
     * }
     *
     * @example
     * // Update handler with multiple items
     * onUpdate: async ({ transaction, collection }) => {
     *   const updates = transaction.mutations.map(m => ({
     *     id: m.key,
     *     changes: m.changes
     *   }))
     *   await api.updateTodos(updates)
     * }
     *
     * @example
     * // Update handler with optimistic rollback
     * onUpdate: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   try {
     *     await api.updateTodo(mutation.original.id, mutation.changes)
     *   } catch (error) {
     *     // Transaction will automatically rollback optimistic changes
     *     console.error('Update failed, rolling back:', error)
     *     throw error
     *   }
     * }
     */
    onUpdate?: UpdateMutationFn<T, TKey, TUtils, TReturn>;
    /**
     * Optional asynchronous handler function called before a delete operation
     * @param params Object containing transaction and collection information
     * @returns Promise resolving to any value
     * @example
     * // Basic delete handler
     * onDelete: async ({ transaction, collection }) => {
     *   const deletedKey = transaction.mutations[0].key
     *   await api.deleteTodo(deletedKey)
     * }
     *
     * @example
     * // Delete handler with multiple items
     * onDelete: async ({ transaction, collection }) => {
     *   const keysToDelete = transaction.mutations.map(m => m.key)
     *   await api.deleteTodos(keysToDelete)
     * }
     *
     * @example
     * // Delete handler with confirmation
     * onDelete: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   const shouldDelete = await confirmDeletion(mutation.original)
     *   if (!shouldDelete) {
     *     throw new Error('Delete cancelled by user')
     *   }
     *   await api.deleteTodo(mutation.original.id)
     * }
     *
     * @example
     * // Delete handler with optimistic rollback
     * onDelete: async ({ transaction, collection }) => {
     *   const mutation = transaction.mutations[0]
     *   try {
     *     await api.deleteTodo(mutation.original.id)
     *   } catch (error) {
     *     // Transaction will automatically rollback optimistic changes
     *     console.error('Delete failed, rolling back:', error)
     *     throw error
     *   }
     * }
     */
    onDelete?: DeleteMutationFn<T, TKey, TUtils, TReturn>;
    /**
     * Specifies how to compare data in the collection.
     * This should be configured to match data ordering on the backend.
     * E.g., when using the Electric DB collection these options
     *       should match the database's collation settings.
     */
    defaultStringCollation?: StringCollationConfig;
    utils?: TUtils;
}
export interface CollectionConfig<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = never, TUtils extends UtilsRecord = UtilsRecord> extends BaseCollectionConfig<T, TKey, TSchema, TUtils> {
    sync: SyncConfig<T, TKey>;
}
export type SingleResult = {
    singleResult: true;
};
export type NonSingleResult = {
    singleResult?: never;
};
export type MaybeSingleResult = {
    /**
     * If enabled the collection will return a single object instead of an array
     */
    singleResult?: true;
};
export type CollectionConfigSingleRowOption<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = never, TUtils extends UtilsRecord = {}> = CollectionConfig<T, TKey, TSchema, TUtils> & MaybeSingleResult;
export type ChangesPayload<T extends object = Record<string, unknown>> = Array<ChangeMessage<T>>;
/**
 * An input row from a collection
 */
export type InputRow = [unknown, Record<string, unknown>];
/**
 * A keyed stream is a stream of rows
 * This is used as the inputs from a collection to a query
 */
export type KeyedStream = IStreamBuilder<InputRow>;
/**
 * Result stream type representing the output of compiled queries
 * Always returns [key, [result, orderByIndex]] where orderByIndex is undefined for unordered queries
 */
export type ResultStream = IStreamBuilder<[unknown, [any, string | undefined]]>;
/**
 * A namespaced row is a row withing a pipeline that had each table wrapped in its alias
 */
export type NamespacedRow = Record<string, Record<string, unknown>>;
/**
 * A keyed namespaced row is a row with a key and a namespaced row
 * This is the main representation of a row in a query pipeline
 */
export type KeyedNamespacedRow = [unknown, NamespacedRow];
/**
 * A namespaced and keyed stream is a stream of rows
 * This is used throughout a query pipeline and as the output from a query without
 * a `select` clause.
 */
export type NamespacedAndKeyedStream = IStreamBuilder<KeyedNamespacedRow>;
/**
 * Options for subscribing to collection changes
 */
export interface SubscribeChangesOptions {
    /** Whether to include the current state as initial changes */
    includeInitialState?: boolean;
    /** Pre-compiled expression for filtering changes */
    whereExpression?: BasicExpression<boolean>;
}
export interface SubscribeChangesSnapshotOptions extends Omit<SubscribeChangesOptions, `includeInitialState`> {
    orderBy?: OrderBy;
    limit?: number;
}
/**
 * Options for getting current state as changes
 */
export interface CurrentStateAsChangesOptions {
    /** Pre-compiled expression for filtering the current state */
    where?: BasicExpression<boolean>;
    orderBy?: OrderBy;
    limit?: number;
    optimizedOnly?: boolean;
}
/**
 * Function type for listening to collection changes
 * @param changes - Array of change messages describing what happened
 * @example
 * // Basic change listener
 * const listener: ChangeListener = (changes) => {
 *   changes.forEach(change => {
 *     console.log(`${change.type}: ${change.key}`, change.value)
 *   })
 * }
 *
 * collection.subscribeChanges(listener)
 *
 * @example
 * // Handle different change types
 * const listener: ChangeListener<Todo> = (changes) => {
 *   for (const change of changes) {
 *     switch (change.type) {
 *       case 'insert':
 *         addToUI(change.value)
 *         break
 *       case 'update':
 *         updateInUI(change.key, change.value, change.previousValue)
 *         break
 *       case 'delete':
 *         removeFromUI(change.key)
 *         break
 *     }
 *   }
 * }
 */
export type ChangeListener<T extends object = Record<string, unknown>, TKey extends string | number = string | number> = (changes: Array<ChangeMessage<T, TKey>>) => void;
type BuiltIns = null | undefined | string | number | boolean | symbol | bigint | void | Date | RegExp;
type HasMultipleCallSignatures<T extends (...arguments_: Array<any>) => unknown> = T extends {
    (...arguments_: infer A): unknown;
    (...arguments_: infer B): unknown;
} ? B extends A ? A extends B ? false : true : true : false;
type WritableMapDeep<MapType extends ReadonlyMap<unknown, unknown>> = MapType extends ReadonlyMap<infer KeyType, infer ValueType> ? Map<WritableDeep<KeyType>, WritableDeep<ValueType>> : MapType;
type WritableSetDeep<SetType extends ReadonlySet<unknown>> = SetType extends ReadonlySet<infer ItemType> ? Set<WritableDeep<ItemType>> : SetType;
type WritableObjectDeep<ObjectType extends object> = {
    -readonly [KeyType in keyof ObjectType]: WritableDeep<ObjectType[KeyType]>;
};
type WritableArrayDeep<ArrayType extends ReadonlyArray<unknown>> = ArrayType extends readonly [] ? [] : ArrayType extends readonly [...infer U, infer V] ? [...WritableArrayDeep<U>, WritableDeep<V>] : ArrayType extends readonly [infer U, ...infer V] ? [WritableDeep<U>, ...WritableArrayDeep<V>] : ArrayType extends ReadonlyArray<infer U> ? Array<WritableDeep<U>> : ArrayType extends Array<infer U> ? Array<WritableDeep<U>> : ArrayType;
export type WritableDeep<T> = T extends BuiltIns ? T : T extends (...arguments_: Array<any>) => unknown ? {} extends WritableObjectDeep<T> ? T : HasMultipleCallSignatures<T> extends true ? T : ((...arguments_: Parameters<T>) => ReturnType<T>) & WritableObjectDeep<T> : T extends ReadonlyMap<unknown, unknown> ? WritableMapDeep<T> : T extends ReadonlySet<unknown> ? WritableSetDeep<T> : T extends ReadonlyArray<unknown> ? WritableArrayDeep<T> : T extends object ? WritableObjectDeep<T> : unknown;
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
