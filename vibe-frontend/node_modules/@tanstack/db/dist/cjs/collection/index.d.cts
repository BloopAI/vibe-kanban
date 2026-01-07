import { CollectionStateManager } from './state.cjs';
import { CollectionLifecycleManager } from './lifecycle.js';
import { CollectionSyncManager } from './sync.cjs';
import { CollectionSubscription } from './subscription.cjs';
import { AllCollectionEvents, CollectionEventHandler } from './events.js';
import { BaseIndex, IndexResolver } from '../indexes/base-index.js';
import { IndexOptions } from '../indexes/index-options.js';
import { ChangeMessage, CollectionConfig, CollectionStatus, CurrentStateAsChangesOptions, Fn, InferSchemaInput, InferSchemaOutput, InsertConfig, NonSingleResult, OperationConfig, SingleResult, StringCollationConfig, SubscribeChangesOptions, Transaction as TransactionType, UtilsRecord, WritableDeep } from '../types.cjs';
import { SingleRowRefProxy } from '../query/builder/ref-proxy.cjs';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { BTreeIndex } from '../indexes/btree-index.js';
import { IndexProxy } from '../indexes/lazy-index.js';
/**
 * Enhanced Collection interface that includes both data type T and utilities TUtils
 * @template T - The type of items in the collection
 * @template TKey - The type of the key for the collection
 * @template TUtils - The utilities record type
 * @template TInsertInput - The type for insert operations (can be different from T for schemas with defaults)
 */
export interface Collection<T extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInsertInput extends object = T> extends CollectionImpl<T, TKey, TUtils, TSchema, TInsertInput> {
    readonly utils: TUtils;
    readonly singleResult?: true;
}
/**
 * Creates a new Collection instance with the given configuration
 *
 * @template T - The schema type if a schema is provided, otherwise the type of items in the collection
 * @template TKey - The type of the key for the collection
 * @template TUtils - The utilities record type
 * @param options - Collection options with optional utilities
 * @returns A new Collection with utilities exposed both at top level and under .utils
 *
 * @example
 * // Pattern 1: With operation handlers (direct collection calls)
 * const todos = createCollection({
 *   id: "todos",
 *   getKey: (todo) => todo.id,
 *   schema,
 *   onInsert: async ({ transaction, collection }) => {
 *     // Send to API
 *     await api.createTodo(transaction.mutations[0].modified)
 *   },
 *   onUpdate: async ({ transaction, collection }) => {
 *     await api.updateTodo(transaction.mutations[0].modified)
 *   },
 *   onDelete: async ({ transaction, collection }) => {
 *     await api.deleteTodo(transaction.mutations[0].key)
 *   },
 *   sync: { sync: () => {} }
 * })
 *
 * // Direct usage (handlers manage transactions)
 * const tx = todos.insert({ id: "1", text: "Buy milk", completed: false })
 * await tx.isPersisted.promise
 *
 * @example
 * // Pattern 2: Manual transaction management
 * const todos = createCollection({
 *   getKey: (todo) => todo.id,
 *   schema: todoSchema,
 *   sync: { sync: () => {} }
 * })
 *
 * // Explicit transaction usage
 * const tx = createTransaction({
 *   mutationFn: async ({ transaction }) => {
 *     // Handle all mutations in transaction
 *     await api.saveChanges(transaction.mutations)
 *   }
 * })
 *
 * tx.mutate(() => {
 *   todos.insert({ id: "1", text: "Buy milk" })
 *   todos.update("2", draft => { draft.completed = true })
 * })
 *
 * await tx.isPersisted.promise
 *
 * @example
 * // Using schema for type inference (preferred as it also gives you client side validation)
 * const todoSchema = z.object({
 *   id: z.string(),
 *   title: z.string(),
 *   completed: z.boolean()
 * })
 *
 * const todos = createCollection({
 *   schema: todoSchema,
 *   getKey: (todo) => todo.id,
 *   sync: { sync: () => {} }
 * })
 *
 */
export declare function createCollection<T extends StandardSchemaV1, TKey extends string | number, TUtils extends UtilsRecord>(options: Omit<CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils>, `utils`> & {
    schema: T;
    utils: TUtils;
} & NonSingleResult): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> & NonSingleResult;
export declare function createCollection<T extends StandardSchemaV1, TKey extends string | number, TUtils extends UtilsRecord>(options: CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils> & {
    schema: T;
} & NonSingleResult): Collection<InferSchemaOutput<T>, TKey, Exclude<TUtils, undefined>, T, InferSchemaInput<T>> & NonSingleResult;
export declare function createCollection<T extends StandardSchemaV1, TKey extends string | number, TUtils extends UtilsRecord>(options: Omit<CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils>, `utils`> & {
    schema: T;
    utils: TUtils;
} & SingleResult): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> & SingleResult;
export declare function createCollection<T extends StandardSchemaV1, TKey extends string | number, TUtils extends UtilsRecord>(options: CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils> & {
    schema: T;
} & SingleResult): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> & SingleResult;
export declare function createCollection<T extends object, TKey extends string | number, TUtils extends UtilsRecord>(options: Omit<CollectionConfig<T, TKey, never, TUtils>, `utils`> & {
    schema?: never;
    utils: TUtils;
} & NonSingleResult): Collection<T, TKey, TUtils, never, T> & NonSingleResult;
export declare function createCollection<T extends object, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord>(options: CollectionConfig<T, TKey, never, TUtils> & {
    schema?: never;
} & NonSingleResult): Collection<T, TKey, TUtils, never, T> & NonSingleResult;
export declare function createCollection<T extends object, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord>(options: Omit<CollectionConfig<T, TKey, never, TUtils>, `utils`> & {
    schema?: never;
    utils: TUtils;
} & SingleResult): Collection<T, TKey, TUtils, never, T> & SingleResult;
export declare function createCollection<T extends object, TKey extends string | number = string | number, TUtils extends UtilsRecord = UtilsRecord>(options: CollectionConfig<T, TKey, never, TUtils> & {
    schema?: never;
} & SingleResult): Collection<T, TKey, TUtils, never, T> & SingleResult;
export declare class CollectionImpl<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TUtils extends UtilsRecord = {}, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    id: string;
    config: CollectionConfig<TOutput, TKey, TSchema>;
    utils: Record<string, Fn>;
    private _events;
    private _changes;
    _lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
    _sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>;
    private _indexes;
    private _mutations;
    _state: CollectionStateManager<TOutput, TKey, TSchema, TInput>;
    private comparisonOpts;
    /**
     * Creates a new Collection instance
     *
     * @param config - Configuration object for the collection
     * @throws Error if sync config is missing
     */
    constructor(config: CollectionConfig<TOutput, TKey, TSchema>);
    /**
     * Gets the current status of the collection
     */
    get status(): CollectionStatus;
    /**
     * Get the number of subscribers to the collection
     */
    get subscriberCount(): number;
    /**
     * Register a callback to be executed when the collection first becomes ready
     * Useful for preloading collections
     * @param callback Function to call when the collection first becomes ready
     * @example
     * collection.onFirstReady(() => {
     *   console.log('Collection is ready for the first time')
     *   // Safe to access collection.state now
     * })
     */
    onFirstReady(callback: () => void): void;
    /**
     * Check if the collection is ready for use
     * Returns true if the collection has been marked as ready by its sync implementation
     * @returns true if the collection is ready, false otherwise
     * @example
     * if (collection.isReady()) {
     *   console.log('Collection is ready, data is available')
     *   // Safe to access collection.state
     * } else {
     *   console.log('Collection is still loading')
     * }
     */
    isReady(): boolean;
    /**
     * Check if the collection is currently loading more data
     * @returns true if the collection has pending load more operations, false otherwise
     */
    get isLoadingSubset(): boolean;
    /**
     * Start sync immediately - internal method for compiled queries
     * This bypasses lazy loading for special cases like live query results
     */
    startSyncImmediate(): void;
    /**
     * Preload the collection data by starting sync if not already started
     * Multiple concurrent calls will share the same promise
     */
    preload(): Promise<void>;
    /**
     * Get the current value for a key (virtual derived state)
     */
    get(key: TKey): TOutput | undefined;
    /**
     * Check if a key exists in the collection (virtual derived state)
     */
    has(key: TKey): boolean;
    /**
     * Get the current size of the collection (cached)
     */
    get size(): number;
    /**
     * Get all keys (virtual derived state)
     */
    keys(): IterableIterator<TKey>;
    /**
     * Get all values (virtual derived state)
     */
    values(): IterableIterator<TOutput>;
    /**
     * Get all entries (virtual derived state)
     */
    entries(): IterableIterator<[TKey, TOutput]>;
    /**
     * Get all entries (virtual derived state)
     */
    [Symbol.iterator](): IterableIterator<[TKey, TOutput]>;
    /**
     * Execute a callback for each entry in the collection
     */
    forEach(callbackfn: (value: TOutput, key: TKey, index: number) => void): void;
    /**
     * Create a new array with the results of calling a function for each entry in the collection
     */
    map<U>(callbackfn: (value: TOutput, key: TKey, index: number) => U): Array<U>;
    getKeyFromItem(item: TOutput): TKey;
    /**
     * Creates an index on a collection for faster queries.
     * Indexes significantly improve query performance by allowing constant time lookups
     * and logarithmic time range queries instead of full scans.
     *
     * @template TResolver - The type of the index resolver (constructor or async loader)
     * @param indexCallback - Function that extracts the indexed value from each item
     * @param config - Configuration including index type and type-specific options
     * @returns An index proxy that provides access to the index when ready
     *
     * @example
     * // Create a default B+ tree index
     * const ageIndex = collection.createIndex((row) => row.age)
     *
     * // Create a ordered index with custom options
     * const ageIndex = collection.createIndex((row) => row.age, {
     *   indexType: BTreeIndex,
     *   options: {
     *     compareFn: customComparator,
     *     compareOptions: { direction: 'asc', nulls: 'first', stringSort: 'lexical' }
     *   },
     *   name: 'age_btree'
     * })
     *
     * // Create an async-loaded index
     * const textIndex = collection.createIndex((row) => row.content, {
     *   indexType: async () => {
     *     const { FullTextIndex } = await import('./indexes/fulltext.js')
     *     return FullTextIndex
     *   },
     *   options: { language: 'en' }
     * })
     */
    createIndex<TResolver extends IndexResolver<TKey> = typeof BTreeIndex>(indexCallback: (row: SingleRowRefProxy<TOutput>) => any, config?: IndexOptions<TResolver>): IndexProxy<TKey>;
    /**
     * Get resolved indexes for query optimization
     */
    get indexes(): Map<number, BaseIndex<TKey>>;
    /**
     * Validates the data against the schema
     */
    validateData(data: unknown, type: `insert` | `update`, key?: TKey): TOutput | never;
    get compareOptions(): StringCollationConfig;
    /**
     * Inserts one or more items into the collection
     * @param items - Single item or array of items to insert
     * @param config - Optional configuration including metadata
     * @returns A Transaction object representing the insert operation(s)
     * @throws {SchemaValidationError} If the data fails schema validation
     * @example
     * // Insert a single todo (requires onInsert handler)
     * const tx = collection.insert({ id: "1", text: "Buy milk", completed: false })
     * await tx.isPersisted.promise
     *
     * @example
     * // Insert multiple todos at once
     * const tx = collection.insert([
     *   { id: "1", text: "Buy milk", completed: false },
     *   { id: "2", text: "Walk dog", completed: true }
     * ])
     * await tx.isPersisted.promise
     *
     * @example
     * // Insert with metadata
     * const tx = collection.insert({ id: "1", text: "Buy groceries" },
     *   { metadata: { source: "mobile-app" } }
     * )
     * await tx.isPersisted.promise
     *
     * @example
     * // Handle errors
     * try {
     *   const tx = collection.insert({ id: "1", text: "New item" })
     *   await tx.isPersisted.promise
     *   console.log('Insert successful')
     * } catch (error) {
     *   console.log('Insert failed:', error)
     * }
     */
    insert: (data: TInput | Array<TInput>, config?: InsertConfig) => TransactionType<Record<string, unknown>>;
    /**
     * Updates one or more items in the collection using a callback function
     * @param keys - Single key or array of keys to update
     * @param configOrCallback - Either update configuration or update callback
     * @param maybeCallback - Update callback if config was provided
     * @returns A Transaction object representing the update operation(s)
     * @throws {SchemaValidationError} If the updated data fails schema validation
     * @example
     * // Update single item by key
     * const tx = collection.update("todo-1", (draft) => {
     *   draft.completed = true
     * })
     * await tx.isPersisted.promise
     *
     * @example
     * // Update multiple items
     * const tx = collection.update(["todo-1", "todo-2"], (drafts) => {
     *   drafts.forEach(draft => { draft.completed = true })
     * })
     * await tx.isPersisted.promise
     *
     * @example
     * // Update with metadata
     * const tx = collection.update("todo-1",
     *   { metadata: { reason: "user update" } },
     *   (draft) => { draft.text = "Updated text" }
     * )
     * await tx.isPersisted.promise
     *
     * @example
     * // Handle errors
     * try {
     *   const tx = collection.update("item-1", draft => { draft.value = "new" })
     *   await tx.isPersisted.promise
     *   console.log('Update successful')
     * } catch (error) {
     *   console.log('Update failed:', error)
     * }
     */
    update(key: Array<TKey | unknown>, callback: (drafts: Array<WritableDeep<TInput>>) => void): TransactionType;
    update(keys: Array<TKey | unknown>, config: OperationConfig, callback: (drafts: Array<WritableDeep<TInput>>) => void): TransactionType;
    update(id: TKey | unknown, callback: (draft: WritableDeep<TInput>) => void): TransactionType;
    update(id: TKey | unknown, config: OperationConfig, callback: (draft: WritableDeep<TInput>) => void): TransactionType;
    /**
     * Deletes one or more items from the collection
     * @param keys - Single key or array of keys to delete
     * @param config - Optional configuration including metadata
     * @returns A Transaction object representing the delete operation(s)
     * @example
     * // Delete a single item
     * const tx = collection.delete("todo-1")
     * await tx.isPersisted.promise
     *
     * @example
     * // Delete multiple items
     * const tx = collection.delete(["todo-1", "todo-2"])
     * await tx.isPersisted.promise
     *
     * @example
     * // Delete with metadata
     * const tx = collection.delete("todo-1", { metadata: { reason: "completed" } })
     * await tx.isPersisted.promise
     *
     * @example
     * // Handle errors
     * try {
     *   const tx = collection.delete("item-1")
     *   await tx.isPersisted.promise
     *   console.log('Delete successful')
     * } catch (error) {
     *   console.log('Delete failed:', error)
     * }
     */
    delete: (keys: Array<TKey> | TKey, config?: OperationConfig) => TransactionType<any>;
    /**
     * Gets the current state of the collection as a Map
     * @returns Map containing all items in the collection, with keys as identifiers
     * @example
     * const itemsMap = collection.state
     * console.log(`Collection has ${itemsMap.size} items`)
     *
     * for (const [key, item] of itemsMap) {
     *   console.log(`${key}: ${item.title}`)
     * }
     *
     * // Check if specific item exists
     * if (itemsMap.has("todo-1")) {
     *   console.log("Todo 1 exists:", itemsMap.get("todo-1"))
     * }
     */
    get state(): Map<TKey, TOutput>;
    /**
     * Gets the current state of the collection as a Map, but only resolves when data is available
     * Waits for the first sync commit to complete before resolving
     *
     * @returns Promise that resolves to a Map containing all items in the collection
     */
    stateWhenReady(): Promise<Map<TKey, TOutput>>;
    /**
     * Gets the current state of the collection as an Array
     *
     * @returns An Array containing all items in the collection
     */
    get toArray(): TOutput[];
    /**
     * Gets the current state of the collection as an Array, but only resolves when data is available
     * Waits for the first sync commit to complete before resolving
     *
     * @returns Promise that resolves to an Array containing all items in the collection
     */
    toArrayWhenReady(): Promise<Array<TOutput>>;
    /**
     * Returns the current state of the collection as an array of changes
     * @param options - Options including optional where filter
     * @returns An array of changes
     * @example
     * // Get all items as changes
     * const allChanges = collection.currentStateAsChanges()
     *
     * // Get only items matching a condition
     * const activeChanges = collection.currentStateAsChanges({
     *   where: (row) => row.status === 'active'
     * })
     *
     * // Get only items using a pre-compiled expression
     * const activeChanges = collection.currentStateAsChanges({
     *   whereExpression: eq(row.status, 'active')
     * })
     */
    currentStateAsChanges(options?: CurrentStateAsChangesOptions): Array<ChangeMessage<TOutput>> | void;
    /**
     * Subscribe to changes in the collection
     * @param callback - Function called when items change
     * @param options - Subscription options including includeInitialState and where filter
     * @returns Unsubscribe function - Call this to stop listening for changes
     * @example
     * // Basic subscription
     * const subscription = collection.subscribeChanges((changes) => {
     *   changes.forEach(change => {
     *     console.log(`${change.type}: ${change.key}`, change.value)
     *   })
     * })
     *
     * // Later: subscription.unsubscribe()
     *
     * @example
     * // Include current state immediately
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, { includeInitialState: true })
     *
     * @example
     * // Subscribe only to changes matching a condition
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, {
     *   includeInitialState: true,
     *   where: (row) => row.status === 'active'
     * })
     *
     * @example
     * // Subscribe using a pre-compiled expression
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, {
     *   includeInitialState: true,
     *   whereExpression: eq(row.status, 'active')
     * })
     */
    subscribeChanges(callback: (changes: Array<ChangeMessage<TOutput>>) => void, options?: SubscribeChangesOptions): CollectionSubscription;
    /**
     * Subscribe to a collection event
     */
    on<T extends keyof AllCollectionEvents>(event: T, callback: CollectionEventHandler<T>): () => void;
    /**
     * Subscribe to a collection event once
     */
    once<T extends keyof AllCollectionEvents>(event: T, callback: CollectionEventHandler<T>): () => void;
    /**
     * Unsubscribe from a collection event
     */
    off<T extends keyof AllCollectionEvents>(event: T, callback: CollectionEventHandler<T>): void;
    /**
     * Wait for a collection event
     */
    waitFor<T extends keyof AllCollectionEvents>(event: T, timeout?: number): Promise<AllCollectionEvents[T]>;
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup(): Promise<void>;
}
