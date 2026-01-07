import {
  CollectionRequiresConfigError,
  CollectionRequiresSyncConfigError,
} from '../errors'
import { currentStateAsChanges } from './change-events'

import { CollectionStateManager } from './state'
import { CollectionChangesManager } from './changes'
import { CollectionLifecycleManager } from './lifecycle.js'
import { CollectionSyncManager } from './sync'
import { CollectionIndexesManager } from './indexes'
import { CollectionMutationsManager } from './mutations'
import { CollectionEventsManager } from './events.js'
import type { CollectionSubscription } from './subscription'
import type { AllCollectionEvents, CollectionEventHandler } from './events.js'
import type { BaseIndex, IndexResolver } from '../indexes/base-index.js'
import type { IndexOptions } from '../indexes/index-options.js'
import type {
  ChangeMessage,
  CollectionConfig,
  CollectionStatus,
  CurrentStateAsChangesOptions,
  Fn,
  InferSchemaInput,
  InferSchemaOutput,
  InsertConfig,
  NonSingleResult,
  OperationConfig,
  SingleResult,
  StringCollationConfig,
  SubscribeChangesOptions,
  Transaction as TransactionType,
  UtilsRecord,
  WritableDeep,
} from '../types'
import type { SingleRowRefProxy } from '../query/builder/ref-proxy'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { BTreeIndex } from '../indexes/btree-index.js'
import type { IndexProxy } from '../indexes/lazy-index.js'

/**
 * Enhanced Collection interface that includes both data type T and utilities TUtils
 * @template T - The type of items in the collection
 * @template TKey - The type of the key for the collection
 * @template TUtils - The utilities record type
 * @template TInsertInput - The type for insert operations (can be different from T for schemas with defaults)
 */
export interface Collection<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = UtilsRecord,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInsertInput extends object = T,
> extends CollectionImpl<T, TKey, TUtils, TSchema, TInsertInput> {
  readonly utils: TUtils
  readonly singleResult?: true
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

// Overload for when schema is provided and utils is required (not optional)
// We can't infer the Utils type from the CollectionConfig because it will always be optional
// So we omit it from that type and instead infer it from the extension `& { utils: TUtils }`
// such that we have the real, non-optional Utils type
export function createCollection<
  T extends StandardSchemaV1,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  options: Omit<
    CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils>,
    `utils`
  > & {
    schema: T
    utils: TUtils // Required utils
  } & NonSingleResult,
): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> &
  NonSingleResult

// Overload for when schema is provided and utils is optional
// In this case we can simply infer the Utils type from the CollectionConfig type
export function createCollection<
  T extends StandardSchemaV1,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  options: CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils> & {
    schema: T
  } & NonSingleResult,
): Collection<
  InferSchemaOutput<T>,
  TKey,
  Exclude<TUtils, undefined>,
  T,
  InferSchemaInput<T>
> &
  NonSingleResult

// Overload for when schema is provided, singleResult is true, and utils is required
export function createCollection<
  T extends StandardSchemaV1,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  options: Omit<
    CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils>,
    `utils`
  > & {
    schema: T
    utils: TUtils // Required utils
  } & SingleResult,
): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> &
  SingleResult

// Overload for when schema is provided and singleResult is true
export function createCollection<
  T extends StandardSchemaV1,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  options: CollectionConfig<InferSchemaOutput<T>, TKey, T, TUtils> & {
    schema: T
  } & SingleResult,
): Collection<InferSchemaOutput<T>, TKey, TUtils, T, InferSchemaInput<T>> &
  SingleResult

// Overload for when no schema is provided and utils is required
// the type T needs to be passed explicitly unless it can be inferred from the getKey function in the config
export function createCollection<
  T extends object,
  TKey extends string | number,
  TUtils extends UtilsRecord,
>(
  options: Omit<CollectionConfig<T, TKey, never, TUtils>, `utils`> & {
    schema?: never // prohibit schema if an explicit type is provided
    utils: TUtils // Required utils
  } & NonSingleResult,
): Collection<T, TKey, TUtils, never, T> & NonSingleResult

// Overload for when no schema is provided
// the type T needs to be passed explicitly unless it can be inferred from the getKey function in the config
export function createCollection<
  T extends object,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = UtilsRecord,
>(
  options: CollectionConfig<T, TKey, never, TUtils> & {
    schema?: never // prohibit schema if an explicit type is provided
  } & NonSingleResult,
): Collection<T, TKey, TUtils, never, T> & NonSingleResult

// Overload for when no schema is provided, singleResult is true, and utils is required
// the type T needs to be passed explicitly unless it can be inferred from the getKey function in the config
export function createCollection<
  T extends object,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = UtilsRecord,
>(
  options: Omit<CollectionConfig<T, TKey, never, TUtils>, `utils`> & {
    schema?: never // prohibit schema if an explicit type is provided
    utils: TUtils // Required utils
  } & SingleResult,
): Collection<T, TKey, TUtils, never, T> & SingleResult

// Overload for when no schema is provided and singleResult is true
// the type T needs to be passed explicitly unless it can be inferred from the getKey function in the config
export function createCollection<
  T extends object,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = UtilsRecord,
>(
  options: CollectionConfig<T, TKey, never, TUtils> & {
    schema?: never // prohibit schema if an explicit type is provided
  } & SingleResult,
): Collection<T, TKey, TUtils, never, T> & SingleResult

// Implementation
export function createCollection(
  options: CollectionConfig<any, string | number, any, UtilsRecord> & {
    schema?: StandardSchemaV1
  },
): Collection<any, string | number, UtilsRecord, any, any> {
  const collection = new CollectionImpl<any, string | number, any, any, any>(
    options,
  )

  // Attach utils to collection
  if (options.utils) {
    collection.utils = options.utils
  } else {
    collection.utils = {}
  }

  return collection
}

export class CollectionImpl<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TUtils extends UtilsRecord = {},
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  public id: string
  public config: CollectionConfig<TOutput, TKey, TSchema>

  // Utilities namespace
  // This is populated by createCollection
  public utils: Record<string, Fn> = {}

  // Managers
  private _events: CollectionEventsManager
  private _changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>
  public _lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  public _sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>
  private _indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>
  private _mutations: CollectionMutationsManager<
    TOutput,
    TKey,
    TUtils,
    TSchema,
    TInput
  >
  // The core state of the collection is "public" so that is accessible in tests
  // and for debugging
  public _state: CollectionStateManager<TOutput, TKey, TSchema, TInput>

  private comparisonOpts: StringCollationConfig

  /**
   * Creates a new Collection instance
   *
   * @param config - Configuration object for the collection
   * @throws Error if sync config is missing
   */
  constructor(config: CollectionConfig<TOutput, TKey, TSchema>) {
    // eslint-disable-next-line
    if (!config) {
      throw new CollectionRequiresConfigError()
    }

    // eslint-disable-next-line
    if (!config.sync) {
      throw new CollectionRequiresSyncConfigError()
    }

    if (config.id) {
      this.id = config.id
    } else {
      this.id = crypto.randomUUID()
    }

    // Set default values for optional config properties
    this.config = {
      ...config,
      autoIndex: config.autoIndex ?? `eager`,
    }

    this._changes = new CollectionChangesManager()
    this._events = new CollectionEventsManager()
    this._indexes = new CollectionIndexesManager()
    this._lifecycle = new CollectionLifecycleManager(config, this.id)
    this._mutations = new CollectionMutationsManager(config, this.id)
    this._state = new CollectionStateManager(config)
    this._sync = new CollectionSyncManager(config, this.id)

    this.comparisonOpts = buildCompareOptionsFromConfig(config)

    this._changes.setDeps({
      collection: this, // Required for passing to CollectionSubscription
      lifecycle: this._lifecycle,
      sync: this._sync,
      events: this._events,
    })
    this._events.setDeps({
      collection: this, // Required for adding to emitted events
    })
    this._indexes.setDeps({
      state: this._state,
      lifecycle: this._lifecycle,
    })
    this._lifecycle.setDeps({
      changes: this._changes,
      events: this._events,
      indexes: this._indexes,
      state: this._state,
      sync: this._sync,
    })
    this._mutations.setDeps({
      collection: this, // Required for passing to config.onInsert/onUpdate/onDelete and annotating mutations
      lifecycle: this._lifecycle,
      state: this._state,
    })
    this._state.setDeps({
      collection: this, // Required for filtering events to only include this collection
      lifecycle: this._lifecycle,
      changes: this._changes,
      indexes: this._indexes,
      events: this._events,
    })
    this._sync.setDeps({
      collection: this, // Required for passing to config.sync callback
      state: this._state,
      lifecycle: this._lifecycle,
      events: this._events,
    })

    // Only start sync immediately if explicitly enabled
    if (config.startSync === true) {
      this._sync.startSync()
    }
  }

  /**
   * Gets the current status of the collection
   */
  public get status(): CollectionStatus {
    return this._lifecycle.status
  }

  /**
   * Get the number of subscribers to the collection
   */
  public get subscriberCount(): number {
    return this._changes.activeSubscribersCount
  }

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
  public onFirstReady(callback: () => void): void {
    return this._lifecycle.onFirstReady(callback)
  }

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
  public isReady(): boolean {
    return this._lifecycle.status === `ready`
  }

  /**
   * Check if the collection is currently loading more data
   * @returns true if the collection has pending load more operations, false otherwise
   */
  public get isLoadingSubset(): boolean {
    return this._sync.isLoadingSubset
  }

  /**
   * Start sync immediately - internal method for compiled queries
   * This bypasses lazy loading for special cases like live query results
   */
  public startSyncImmediate(): void {
    this._sync.startSync()
  }

  /**
   * Preload the collection data by starting sync if not already started
   * Multiple concurrent calls will share the same promise
   */
  public preload(): Promise<void> {
    return this._sync.preload()
  }

  /**
   * Get the current value for a key (virtual derived state)
   */
  public get(key: TKey): TOutput | undefined {
    return this._state.get(key)
  }

  /**
   * Check if a key exists in the collection (virtual derived state)
   */
  public has(key: TKey): boolean {
    return this._state.has(key)
  }

  /**
   * Get the current size of the collection (cached)
   */
  public get size(): number {
    return this._state.size
  }

  /**
   * Get all keys (virtual derived state)
   */
  public *keys(): IterableIterator<TKey> {
    yield* this._state.keys()
  }

  /**
   * Get all values (virtual derived state)
   */
  public *values(): IterableIterator<TOutput> {
    yield* this._state.values()
  }

  /**
   * Get all entries (virtual derived state)
   */
  public *entries(): IterableIterator<[TKey, TOutput]> {
    yield* this._state.entries()
  }

  /**
   * Get all entries (virtual derived state)
   */
  public *[Symbol.iterator](): IterableIterator<[TKey, TOutput]> {
    yield* this._state[Symbol.iterator]()
  }

  /**
   * Execute a callback for each entry in the collection
   */
  public forEach(
    callbackfn: (value: TOutput, key: TKey, index: number) => void,
  ): void {
    return this._state.forEach(callbackfn)
  }

  /**
   * Create a new array with the results of calling a function for each entry in the collection
   */
  public map<U>(
    callbackfn: (value: TOutput, key: TKey, index: number) => U,
  ): Array<U> {
    return this._state.map(callbackfn)
  }

  public getKeyFromItem(item: TOutput): TKey {
    return this.config.getKey(item)
  }

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
  public createIndex<TResolver extends IndexResolver<TKey> = typeof BTreeIndex>(
    indexCallback: (row: SingleRowRefProxy<TOutput>) => any,
    config: IndexOptions<TResolver> = {},
  ): IndexProxy<TKey> {
    return this._indexes.createIndex(indexCallback, config)
  }

  /**
   * Get resolved indexes for query optimization
   */
  get indexes(): Map<number, BaseIndex<TKey>> {
    return this._indexes.indexes
  }

  /**
   * Validates the data against the schema
   */
  public validateData(
    data: unknown,
    type: `insert` | `update`,
    key?: TKey,
  ): TOutput | never {
    return this._mutations.validateData(data, type, key)
  }

  get compareOptions(): StringCollationConfig {
    // return a copy such that no one can mutate the internal comparison object
    return { ...this.comparisonOpts }
  }

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
  insert = (data: TInput | Array<TInput>, config?: InsertConfig) => {
    return this._mutations.insert(data, config)
  }

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

  // Overload 1: Update multiple items with a callback
  update(
    key: Array<TKey | unknown>,
    callback: (drafts: Array<WritableDeep<TInput>>) => void,
  ): TransactionType

  // Overload 2: Update multiple items with config and a callback
  update(
    keys: Array<TKey | unknown>,
    config: OperationConfig,
    callback: (drafts: Array<WritableDeep<TInput>>) => void,
  ): TransactionType

  // Overload 3: Update a single item with a callback
  update(
    id: TKey | unknown,
    callback: (draft: WritableDeep<TInput>) => void,
  ): TransactionType

  // Overload 4: Update a single item with config and a callback
  update(
    id: TKey | unknown,
    config: OperationConfig,
    callback: (draft: WritableDeep<TInput>) => void,
  ): TransactionType

  update(
    keys: (TKey | unknown) | Array<TKey | unknown>,
    configOrCallback:
      | ((draft: WritableDeep<TInput>) => void)
      | ((drafts: Array<WritableDeep<TInput>>) => void)
      | OperationConfig,
    maybeCallback?:
      | ((draft: WritableDeep<TInput>) => void)
      | ((drafts: Array<WritableDeep<TInput>>) => void),
  ) {
    return this._mutations.update(keys, configOrCallback, maybeCallback)
  }

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
  delete = (
    keys: Array<TKey> | TKey,
    config?: OperationConfig,
  ): TransactionType<any> => {
    return this._mutations.delete(keys, config)
  }

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
  get state() {
    const result = new Map<TKey, TOutput>()
    for (const [key, value] of this.entries()) {
      result.set(key, value)
    }
    return result
  }

  /**
   * Gets the current state of the collection as a Map, but only resolves when data is available
   * Waits for the first sync commit to complete before resolving
   *
   * @returns Promise that resolves to a Map containing all items in the collection
   */
  stateWhenReady(): Promise<Map<TKey, TOutput>> {
    // If we already have data or collection is ready, resolve immediately
    if (this.size > 0 || this.isReady()) {
      return Promise.resolve(this.state)
    }

    // Use preload to ensure the collection starts loading, then return the state
    return this.preload().then(() => this.state)
  }

  /**
   * Gets the current state of the collection as an Array
   *
   * @returns An Array containing all items in the collection
   */
  get toArray() {
    return Array.from(this.values())
  }

  /**
   * Gets the current state of the collection as an Array, but only resolves when data is available
   * Waits for the first sync commit to complete before resolving
   *
   * @returns Promise that resolves to an Array containing all items in the collection
   */
  toArrayWhenReady(): Promise<Array<TOutput>> {
    // If we already have data or collection is ready, resolve immediately
    if (this.size > 0 || this.isReady()) {
      return Promise.resolve(this.toArray)
    }

    // Use preload to ensure the collection starts loading, then return the array
    return this.preload().then(() => this.toArray)
  }

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
  public currentStateAsChanges(
    options: CurrentStateAsChangesOptions = {},
  ): Array<ChangeMessage<TOutput>> | void {
    return currentStateAsChanges(this, options)
  }

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
  public subscribeChanges(
    callback: (changes: Array<ChangeMessage<TOutput>>) => void,
    options: SubscribeChangesOptions = {},
  ): CollectionSubscription {
    return this._changes.subscribeChanges(callback, options)
  }

  /**
   * Subscribe to a collection event
   */
  public on<T extends keyof AllCollectionEvents>(
    event: T,
    callback: CollectionEventHandler<T>,
  ) {
    return this._events.on(event, callback)
  }

  /**
   * Subscribe to a collection event once
   */
  public once<T extends keyof AllCollectionEvents>(
    event: T,
    callback: CollectionEventHandler<T>,
  ) {
    return this._events.once(event, callback)
  }

  /**
   * Unsubscribe from a collection event
   */
  public off<T extends keyof AllCollectionEvents>(
    event: T,
    callback: CollectionEventHandler<T>,
  ) {
    this._events.off(event, callback)
  }

  /**
   * Wait for a collection event
   */
  public waitFor<T extends keyof AllCollectionEvents>(
    event: T,
    timeout?: number,
  ) {
    return this._events.waitFor(event, timeout)
  }

  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  public async cleanup(): Promise<void> {
    this._lifecycle.cleanup()
    return Promise.resolve()
  }
}

function buildCompareOptionsFromConfig(
  config: CollectionConfig<any, any, any>,
): StringCollationConfig {
  if (config.defaultStringCollation) {
    const options = config.defaultStringCollation
    return {
      stringSort: options.stringSort ?? `locale`,
      locale: options.stringSort === `locale` ? options.locale : undefined,
      localeOptions:
        options.stringSort === `locale` ? options.localeOptions : undefined,
    }
  } else {
    return {
      stringSort: `locale`,
    }
  }
}
