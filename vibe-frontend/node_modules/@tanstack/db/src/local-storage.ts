import {
  InvalidStorageDataFormatError,
  InvalidStorageObjectFormatError,
  SerializationError,
  StorageKeyRequiredError,
} from './errors'
import type {
  BaseCollectionConfig,
  CollectionConfig,
  DeleteMutationFnParams,
  InferSchemaOutput,
  InsertMutationFnParams,
  PendingMutation,
  SyncConfig,
  UpdateMutationFnParams,
  UtilsRecord,
} from './types'
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Storage API interface - subset of DOM Storage that we need
 */
export type StorageApi = Pick<Storage, `getItem` | `setItem` | `removeItem`>

/**
 * Storage event API - subset of Window for 'storage' events only
 */
export type StorageEventApi = {
  addEventListener: (
    type: `storage`,
    listener: (event: StorageEvent) => void,
  ) => void
  removeEventListener: (
    type: `storage`,
    listener: (event: StorageEvent) => void,
  ) => void
}

/**
 * Internal storage format that includes version tracking
 */
interface StoredItem<T> {
  versionKey: string
  data: T
}

export interface Parser {
  parse: (data: string) => unknown
  stringify: (data: unknown) => string
}

/**
 * Configuration interface for localStorage collection options
 * @template T - The type of items in the collection
 * @template TSchema - The schema type for validation
 * @template TKey - The type of the key returned by `getKey`
 */
export interface LocalStorageCollectionConfig<
  T extends object = object,
  TSchema extends StandardSchemaV1 = never,
  TKey extends string | number = string | number,
> extends BaseCollectionConfig<T, TKey, TSchema> {
  /**
   * The key to use for storing the collection data in localStorage/sessionStorage
   */
  storageKey: string

  /**
   * Storage API to use (defaults to window.localStorage)
   * Can be any object that implements the Storage interface (e.g., sessionStorage)
   */
  storage?: StorageApi

  /**
   * Storage event API to use for cross-tab synchronization (defaults to window)
   * Can be any object that implements addEventListener/removeEventListener for storage events
   */
  storageEventApi?: StorageEventApi

  /**
   * Parser to use for serializing and deserializing data to and from storage
   * Defaults to JSON
   */
  parser?: Parser
}

/**
 * Type for the clear utility function
 */
export type ClearStorageFn = () => void

/**
 * Type for the getStorageSize utility function
 */
export type GetStorageSizeFn = () => number

/**
 * LocalStorage collection utilities type
 */
export interface LocalStorageCollectionUtils extends UtilsRecord {
  clearStorage: ClearStorageFn
  getStorageSize: GetStorageSizeFn
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
    mutations: Array<PendingMutation<Record<string, unknown>>>
  }) => void
}

/**
 * Validates that a value can be JSON serialized
 * @param parser - The parser to use for serialization
 * @param value - The value to validate for JSON serialization
 * @param operation - The operation type being performed (for error messages)
 * @throws Error if the value cannot be JSON serialized
 */
function validateJsonSerializable(
  parser: Parser,
  value: any,
  operation: string,
): void {
  try {
    parser.stringify(value)
  } catch (error) {
    throw new SerializationError(
      operation,
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * Generate a UUID for version tracking
 * @returns A unique identifier string for tracking data versions
 */
function generateUuid(): string {
  return crypto.randomUUID()
}

/**
 * Encodes a key (string or number) into a storage-safe string format.
 * This prevents collisions between numeric and string keys by prefixing with type information.
 *
 * Examples:
 *   - number 1 → "n:1"
 *   - string "1" → "s:1"
 *   - string "n:1" → "s:n:1"
 *
 * @param key - The key to encode (string or number)
 * @returns Type-prefixed string that is safe for storage
 */
function encodeStorageKey(key: string | number): string {
  if (typeof key === `number`) {
    return `n:${key}`
  }
  return `s:${key}`
}

/**
 * Decodes a storage key back to its original form.
 * This is the inverse of encodeStorageKey.
 *
 * @param encodedKey - The encoded key from storage
 * @returns The original key (string or number)
 */
function decodeStorageKey(encodedKey: string): string | number {
  if (encodedKey.startsWith(`n:`)) {
    return Number(encodedKey.slice(2))
  }
  if (encodedKey.startsWith(`s:`)) {
    return encodedKey.slice(2)
  }
  // Fallback for legacy data without encoding
  return encodedKey
}

/**
 * Creates an in-memory storage implementation that mimics the StorageApi interface
 * Used as a fallback when localStorage is not available (e.g., server-side rendering)
 * @returns An object implementing the StorageApi interface using an in-memory Map
 */
function createInMemoryStorage(): StorageApi {
  const storage = new Map<string, string>()

  return {
    getItem(key: string): string | null {
      return storage.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      storage.set(key, value)
    },
    removeItem(key: string): void {
      storage.delete(key)
    },
  }
}

/**
 * Creates a no-op storage event API for environments without window (e.g., server-side)
 * This provides the required interface but doesn't actually listen to any events
 * since cross-tab synchronization is not possible in server environments
 * @returns An object implementing the StorageEventApi interface with no-op methods
 */
function createNoOpStorageEventApi(): StorageEventApi {
  return {
    addEventListener: () => {
      // No-op: cannot listen to storage events without window
    },
    removeEventListener: () => {
      // No-op: cannot remove listeners without window
    },
  }
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

// Overload for when schema is provided
export function localStorageCollectionOptions<
  T extends StandardSchemaV1,
  TKey extends string | number = string | number,
>(
  config: LocalStorageCollectionConfig<InferSchemaOutput<T>, T, TKey> & {
    schema: T
  },
): CollectionConfig<
  InferSchemaOutput<T>,
  TKey,
  T,
  LocalStorageCollectionUtils
> & {
  id: string
  utils: LocalStorageCollectionUtils
  schema: T
}

// Overload for when no schema is provided
// the type T needs to be passed explicitly unless it can be inferred from the getKey function in the config
export function localStorageCollectionOptions<
  T extends object,
  TKey extends string | number = string | number,
>(
  config: LocalStorageCollectionConfig<T, never, TKey> & {
    schema?: never // prohibit schema
  },
): CollectionConfig<T, TKey, never, LocalStorageCollectionUtils> & {
  id: string
  utils: LocalStorageCollectionUtils
  schema?: never // no schema in the result
}

export function localStorageCollectionOptions(
  config: LocalStorageCollectionConfig<any, any, string | number>,
): Omit<
  CollectionConfig<any, string | number, any, LocalStorageCollectionUtils>,
  `id`
> & {
  id: string
  utils: LocalStorageCollectionUtils
  schema?: StandardSchemaV1
} {
  // Validate required parameters
  if (!config.storageKey) {
    throw new StorageKeyRequiredError()
  }

  // Default to window.localStorage if no storage is provided
  // Fall back to in-memory storage if localStorage is not available (e.g., server-side rendering)
  const storage =
    config.storage ||
    (typeof window !== `undefined` ? window.localStorage : null) ||
    createInMemoryStorage()

  // Default to window for storage events if not provided
  // Fall back to no-op storage event API if window is not available (e.g., server-side rendering)
  const storageEventApi =
    config.storageEventApi ||
    (typeof window !== `undefined` ? window : null) ||
    createNoOpStorageEventApi()

  // Default to JSON parser if no parser is provided
  const parser = config.parser || JSON

  // Track the last known state to detect changes
  const lastKnownData = new Map<string | number, StoredItem<any>>()

  // Create the sync configuration
  const sync = createLocalStorageSync<any>(
    config.storageKey,
    storage,
    storageEventApi,
    parser,
    config.getKey,
    lastKnownData,
  )

  /**
   * Save data to storage
   * @param dataMap - Map of items with version tracking to save to storage
   */
  const saveToStorage = (
    dataMap: Map<string | number, StoredItem<any>>,
  ): void => {
    try {
      // Convert Map to object format for storage
      const objectData: Record<string, StoredItem<any>> = {}
      dataMap.forEach((storedItem, key) => {
        objectData[encodeStorageKey(key)] = storedItem
      })
      const serialized = parser.stringify(objectData)
      storage.setItem(config.storageKey, serialized)
    } catch (error) {
      console.error(
        `[LocalStorageCollection] Error saving data to storage key "${config.storageKey}":`,
        error,
      )
      throw error
    }
  }

  /**
   * Removes all collection data from the configured storage
   */
  const clearStorage: ClearStorageFn = (): void => {
    storage.removeItem(config.storageKey)
  }

  /**
   * Get the size of the stored data in bytes (approximate)
   * @returns The approximate size in bytes of the stored collection data
   */
  const getStorageSize: GetStorageSizeFn = (): number => {
    const data = storage.getItem(config.storageKey)
    return data ? new Blob([data]).size : 0
  }

  /*
   * Create wrapper handlers for direct persistence operations that perform actual storage operations
   * Wraps the user's onInsert handler to also save changes to localStorage
   */
  const wrappedOnInsert = async (params: InsertMutationFnParams<any>) => {
    // Validate that all values in the transaction can be JSON serialized
    params.transaction.mutations.forEach((mutation) => {
      validateJsonSerializable(parser, mutation.modified, `insert`)
    })

    // Call the user handler BEFORE persisting changes (if provided)
    let handlerResult: any = {}
    if (config.onInsert) {
      handlerResult = (await config.onInsert(params)) ?? {}
    }

    // Always persist to storage
    // Use lastKnownData (in-memory cache) instead of reading from storage
    // Add new items with version keys
    params.transaction.mutations.forEach((mutation) => {
      // Use the engine's pre-computed key for consistency
      const storedItem: StoredItem<any> = {
        versionKey: generateUuid(),
        data: mutation.modified,
      }
      lastKnownData.set(mutation.key, storedItem)
    })

    // Save to storage
    saveToStorage(lastKnownData)

    // Confirm mutations through sync interface (moves from optimistic to synced state)
    // without reloading from storage
    sync.confirmOperationsSync(params.transaction.mutations)

    return handlerResult
  }

  const wrappedOnUpdate = async (params: UpdateMutationFnParams<any>) => {
    // Validate that all values in the transaction can be JSON serialized
    params.transaction.mutations.forEach((mutation) => {
      validateJsonSerializable(parser, mutation.modified, `update`)
    })

    // Call the user handler BEFORE persisting changes (if provided)
    let handlerResult: any = {}
    if (config.onUpdate) {
      handlerResult = (await config.onUpdate(params)) ?? {}
    }

    // Always persist to storage
    // Use lastKnownData (in-memory cache) instead of reading from storage
    // Update items with new version keys
    params.transaction.mutations.forEach((mutation) => {
      // Use the engine's pre-computed key for consistency
      const storedItem: StoredItem<any> = {
        versionKey: generateUuid(),
        data: mutation.modified,
      }
      lastKnownData.set(mutation.key, storedItem)
    })

    // Save to storage
    saveToStorage(lastKnownData)

    // Confirm mutations through sync interface (moves from optimistic to synced state)
    // without reloading from storage
    sync.confirmOperationsSync(params.transaction.mutations)

    return handlerResult
  }

  const wrappedOnDelete = async (params: DeleteMutationFnParams<any>) => {
    // Call the user handler BEFORE persisting changes (if provided)
    let handlerResult: any = {}
    if (config.onDelete) {
      handlerResult = (await config.onDelete(params)) ?? {}
    }

    // Always persist to storage
    // Use lastKnownData (in-memory cache) instead of reading from storage
    // Remove items
    params.transaction.mutations.forEach((mutation) => {
      // Use the engine's pre-computed key for consistency
      lastKnownData.delete(mutation.key)
    })

    // Save to storage
    saveToStorage(lastKnownData)

    // Confirm mutations through sync interface (moves from optimistic to synced state)
    // without reloading from storage
    sync.confirmOperationsSync(params.transaction.mutations)

    return handlerResult
  }

  // Extract standard Collection config properties
  const {
    storageKey: _storageKey,
    storage: _storage,
    storageEventApi: _storageEventApi,
    onInsert: _onInsert,
    onUpdate: _onUpdate,
    onDelete: _onDelete,
    id,
    ...restConfig
  } = config

  // Default id to a pattern based on storage key if not provided
  const collectionId = id ?? `local-collection:${config.storageKey}`

  /**
   * Accepts mutations from a transaction that belong to this collection and persists them to storage
   */
  const acceptMutations = (transaction: {
    mutations: Array<PendingMutation<Record<string, unknown>>>
  }) => {
    // Filter mutations that belong to this collection
    // Use collection ID for filtering if collection reference isn't available yet
    const collectionMutations = transaction.mutations.filter((m) => {
      // Try to match by collection reference first
      if (sync.collection && m.collection === sync.collection) {
        return true
      }
      // Fall back to matching by collection ID
      return m.collection.id === collectionId
    })

    if (collectionMutations.length === 0) {
      return
    }

    // Validate all mutations can be serialized before modifying storage
    for (const mutation of collectionMutations) {
      switch (mutation.type) {
        case `insert`:
        case `update`:
          validateJsonSerializable(parser, mutation.modified, mutation.type)
          break
        case `delete`:
          validateJsonSerializable(parser, mutation.original, mutation.type)
          break
      }
    }

    // Use lastKnownData (in-memory cache) instead of reading from storage
    // Apply each mutation
    for (const mutation of collectionMutations) {
      // Use the engine's pre-computed key to avoid key derivation issues
      switch (mutation.type) {
        case `insert`:
        case `update`: {
          const storedItem: StoredItem<Record<string, unknown>> = {
            versionKey: generateUuid(),
            data: mutation.modified,
          }
          lastKnownData.set(mutation.key, storedItem)
          break
        }
        case `delete`: {
          lastKnownData.delete(mutation.key)
          break
        }
      }
    }

    // Save to storage
    saveToStorage(lastKnownData)

    // Confirm the mutations in the collection to move them from optimistic to synced state
    // This writes them through the sync interface to make them "synced" instead of "optimistic"
    sync.confirmOperationsSync(collectionMutations)
  }

  return {
    ...restConfig,
    id: collectionId,
    sync,
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {
      clearStorage,
      getStorageSize,
      acceptMutations,
    },
  }
}

/**
 * Load data from storage and return as a Map
 * @param parser - The parser to use for deserializing the data
 * @param storageKey - The key used to store data in the storage API
 * @param storage - The storage API to load from (localStorage, sessionStorage, etc.)
 * @returns Map of stored items with version tracking, or empty Map if loading fails
 */
function loadFromStorage<T extends object>(
  storageKey: string,
  storage: StorageApi,
  parser: Parser,
): Map<string | number, StoredItem<T>> {
  try {
    const rawData = storage.getItem(storageKey)
    if (!rawData) {
      return new Map()
    }

    const parsed = parser.parse(rawData)
    const dataMap = new Map<string | number, StoredItem<T>>()

    // Handle object format where keys map to StoredItem values
    if (
      typeof parsed === `object` &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      Object.entries(parsed).forEach(([encodedKey, value]) => {
        // Runtime check to ensure the value has the expected StoredItem structure
        if (
          value &&
          typeof value === `object` &&
          `versionKey` in value &&
          `data` in value
        ) {
          const storedItem = value as StoredItem<T>
          const decodedKey = decodeStorageKey(encodedKey)
          dataMap.set(decodedKey, storedItem)
        } else {
          throw new InvalidStorageDataFormatError(storageKey, encodedKey)
        }
      })
    } else {
      throw new InvalidStorageObjectFormatError(storageKey)
    }

    return dataMap
  } catch (error) {
    console.warn(
      `[LocalStorageCollection] Error loading data from storage key "${storageKey}":`,
      error,
    )
    return new Map()
  }
}

/**
 * Internal function to create localStorage sync configuration
 * Creates a sync configuration that handles localStorage persistence and cross-tab synchronization
 * @param storageKey - The key used for storing data in localStorage
 * @param storage - The storage API to use (localStorage, sessionStorage, etc.)
 * @param storageEventApi - The event API for listening to storage changes
 * @param getKey - Function to extract the key from an item
 * @param lastKnownData - Map tracking the last known state for change detection
 * @returns Sync configuration with manual trigger capability
 */
function createLocalStorageSync<T extends object>(
  storageKey: string,
  storage: StorageApi,
  storageEventApi: StorageEventApi,
  parser: Parser,
  _getKey: (item: T) => string | number,
  lastKnownData: Map<string | number, StoredItem<T>>,
): SyncConfig<T> & {
  manualTrigger?: () => void
  collection: any
  confirmOperationsSync: (mutations: Array<any>) => void
} {
  let syncParams: Parameters<SyncConfig<T>[`sync`]>[0] | null = null
  let collection: any = null

  /**
   * Compare two Maps to find differences using version keys
   * @param oldData - The previous state of stored items
   * @param newData - The current state of stored items
   * @returns Array of changes with type, key, and value information
   */
  const findChanges = (
    oldData: Map<string | number, StoredItem<T>>,
    newData: Map<string | number, StoredItem<T>>,
  ): Array<{
    type: `insert` | `update` | `delete`
    key: string | number
    value?: T
  }> => {
    const changes: Array<{
      type: `insert` | `update` | `delete`
      key: string | number
      value?: T
    }> = []

    // Check for deletions and updates
    oldData.forEach((oldStoredItem, key) => {
      const newStoredItem = newData.get(key)
      if (!newStoredItem) {
        changes.push({ type: `delete`, key, value: oldStoredItem.data })
      } else if (oldStoredItem.versionKey !== newStoredItem.versionKey) {
        changes.push({ type: `update`, key, value: newStoredItem.data })
      }
    })

    // Check for insertions
    newData.forEach((newStoredItem, key) => {
      if (!oldData.has(key)) {
        changes.push({ type: `insert`, key, value: newStoredItem.data })
      }
    })

    return changes
  }

  /**
   * Process storage changes and update collection
   * Loads new data from storage, compares with last known state, and applies changes
   */
  const processStorageChanges = () => {
    if (!syncParams) return

    const { begin, write, commit } = syncParams

    // Load the new data
    const newData = loadFromStorage<T>(storageKey, storage, parser)

    // Find the specific changes
    const changes = findChanges(lastKnownData, newData)

    if (changes.length > 0) {
      begin()
      changes.forEach(({ type, value }) => {
        if (value) {
          validateJsonSerializable(parser, value, type)
          write({ type, value })
        }
      })
      commit()

      // Update lastKnownData
      lastKnownData.clear()
      newData.forEach((storedItem, key) => {
        lastKnownData.set(key, storedItem)
      })
    }
  }

  const syncConfig: SyncConfig<T> & {
    manualTrigger?: () => void
    collection: any
  } = {
    sync: (params: Parameters<SyncConfig<T>[`sync`]>[0]) => {
      const { begin, write, commit, markReady } = params

      // Store sync params and collection for later use
      syncParams = params
      collection = params.collection

      // Initial load
      const initialData = loadFromStorage<T>(storageKey, storage, parser)
      if (initialData.size > 0) {
        begin()
        initialData.forEach((storedItem) => {
          validateJsonSerializable(parser, storedItem.data, `load`)
          write({ type: `insert`, value: storedItem.data })
        })
        commit()
      }

      // Update lastKnownData
      lastKnownData.clear()
      initialData.forEach((storedItem, key) => {
        lastKnownData.set(key, storedItem)
      })

      // Mark collection as ready after initial load
      markReady()

      // Listen for storage events from other tabs
      const handleStorageEvent = (event: StorageEvent) => {
        // Only respond to changes to our specific key and from our storage
        if (event.key !== storageKey || event.storageArea !== storage) {
          return
        }

        processStorageChanges()
      }

      // Add storage event listener for cross-tab sync
      storageEventApi.addEventListener(`storage`, handleStorageEvent)

      // Note: Cleanup is handled automatically by the collection when it's disposed
    },

    /**
     * Get sync metadata - returns storage key information
     * @returns Object containing storage key and storage type metadata
     */
    getSyncMetadata: () => ({
      storageKey,
      storageType:
        storage === (typeof window !== `undefined` ? window.localStorage : null)
          ? `localStorage`
          : `custom`,
    }),

    // Manual trigger function for local updates
    manualTrigger: processStorageChanges,

    // Collection instance reference
    collection,
  }

  /**
   * Confirms mutations by writing them through the sync interface
   * This moves mutations from optimistic to synced state
   * @param mutations - Array of mutation objects to confirm
   */
  const confirmOperationsSync = (mutations: Array<any>) => {
    if (!syncParams) {
      // Sync not initialized yet, mutations will be handled on next sync
      return
    }

    const { begin, write, commit } = syncParams

    // Write the mutations through sync to confirm them
    begin()
    mutations.forEach((mutation: any) => {
      write({
        type: mutation.type,
        value:
          mutation.type === `delete` ? mutation.original : mutation.modified,
      })
    })
    commit()
  }

  return {
    ...syncConfig,
    confirmOperationsSync,
  }
}
