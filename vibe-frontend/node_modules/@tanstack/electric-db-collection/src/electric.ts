import {
  ShapeStream,
  isChangeMessage,
  isControlMessage,
  isVisibleInSnapshot,
} from '@electric-sql/client'
import { Store } from '@tanstack/store'
import DebugModule from 'debug'
import { DeduplicatedLoadSubset, and } from '@tanstack/db'
import {
  ExpectedNumberInAwaitTxIdError,
  StreamAbortedError,
  TimeoutWaitingForMatchError,
  TimeoutWaitingForTxIdError,
} from './errors'
import { compileSQL } from './sql-compiler'
import {
  addTagToIndex,
  findRowsMatchingPattern,
  getTagLength,
  isMoveOutMessage,
  removeTagFromIndex,
  tagMatchesPattern,
} from './tag-index'
import type {
  MoveOutPattern,
  MoveTag,
  ParsedMoveTag,
  RowId,
  TagIndex,
} from './tag-index'
import type {
  BaseCollectionConfig,
  ChangeMessageOrDeleteKeyMessage,
  CollectionConfig,
  DeleteMutationFnParams,
  InsertMutationFnParams,
  LoadSubsetOptions,
  SyncConfig,
  SyncMode,
  UpdateMutationFnParams,
  UtilsRecord,
} from '@tanstack/db'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ControlMessage,
  GetExtensions,
  Message,
  PostgresSnapshot,
  Row,
  ShapeStreamOptions,
} from '@electric-sql/client'

// Re-export for user convenience in custom match functions
export { isChangeMessage, isControlMessage } from '@electric-sql/client'

const debug = DebugModule.debug(`ts/db:electric`)

/**
 * Symbol for internal test hooks (hidden from public API)
 */
export const ELECTRIC_TEST_HOOKS = Symbol(`electricTestHooks`)

/**
 * Internal test hooks interface (for testing only)
 */
export interface ElectricTestHooks {
  /**
   * Called before marking collection ready after first up-to-date in progressive mode
   * Allows tests to pause and validate snapshot phase before atomic swap completes
   */
  beforeMarkingReady?: () => Promise<void>
}

/**
 * Type representing a transaction ID in ElectricSQL
 */
export type Txid = number

/**
 * Custom match function type - receives stream messages and returns boolean
 * indicating if the mutation has been synchronized
 */
export type MatchFunction<T extends Row<unknown>> = (
  message: Message<T>,
) => boolean

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
  txid: Txid | Array<Txid>
  timeout?: number
} | void

/**
 * Type representing a snapshot end message
 */
type SnapshotEndMessage = ControlMessage & {
  headers: { control: `snapshot-end` }
}
// The `InferSchemaOutput` and `ResolveType` are copied from the `@tanstack/db` package
// but we modified `InferSchemaOutput` slightly to restrict the schema output to `Row<unknown>`
// This is needed in order for `GetExtensions` to be able to infer the parser extensions type from the schema
type InferSchemaOutput<T> = T extends StandardSchemaV1
  ? StandardSchemaV1.InferOutput<T> extends Row<unknown>
    ? StandardSchemaV1.InferOutput<T>
    : Record<string, unknown>
  : Record<string, unknown>

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
export type ElectricSyncMode = SyncMode | `progressive`

/**
 * Configuration interface for Electric collection options
 * @template T - The type of items in the collection
 * @template TSchema - The schema type for validation
 */
export interface ElectricCollectionConfig<
  T extends Row<unknown> = Row<unknown>,
  TSchema extends StandardSchemaV1 = never,
> extends Omit<
  BaseCollectionConfig<
    T,
    string | number,
    TSchema,
    ElectricCollectionUtils<T>,
    any
  >,
  `onInsert` | `onUpdate` | `onDelete` | `syncMode`
> {
  /**
   * Configuration options for the ElectricSQL ShapeStream
   */
  shapeOptions: ShapeStreamOptions<GetExtensions<T>>
  syncMode?: ElectricSyncMode

  /**
   * Internal test hooks (for testing only)
   * Hidden via Symbol to prevent accidental usage in production
   */
  [ELECTRIC_TEST_HOOKS]?: ElectricTestHooks

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
  onInsert?: (
    params: InsertMutationFnParams<
      T,
      string | number,
      ElectricCollectionUtils<T>
    >,
  ) => Promise<MatchingStrategy>

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
  onUpdate?: (
    params: UpdateMutationFnParams<
      T,
      string | number,
      ElectricCollectionUtils<T>
    >,
  ) => Promise<MatchingStrategy>

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
  onDelete?: (
    params: DeleteMutationFnParams<
      T,
      string | number,
      ElectricCollectionUtils<T>
    >,
  ) => Promise<MatchingStrategy>
}

function isUpToDateMessage<T extends Row<unknown>>(
  message: Message<T>,
): message is ControlMessage & { up_to_date: true } {
  return isControlMessage(message) && message.headers.control === `up-to-date`
}

function isMustRefetchMessage<T extends Row<unknown>>(
  message: Message<T>,
): message is ControlMessage & { headers: { control: `must-refetch` } } {
  return isControlMessage(message) && message.headers.control === `must-refetch`
}

function isSnapshotEndMessage<T extends Row<unknown>>(
  message: Message<T>,
): message is SnapshotEndMessage {
  return isControlMessage(message) && message.headers.control === `snapshot-end`
}

function isSubsetEndMessage<T extends Row<unknown>>(
  message: Message<T>,
): message is ControlMessage & { headers: { control: `subset-end` } } {
  return (
    isControlMessage(message) &&
    (message.headers.control as string) === `subset-end`
  )
}

function parseSnapshotMessage(message: SnapshotEndMessage): PostgresSnapshot {
  return {
    xmin: message.headers.xmin,
    xmax: message.headers.xmax,
    xip_list: message.headers.xip_list,
  }
}

// Check if a message contains txids in its headers
function hasTxids<T extends Row<unknown>>(
  message: Message<T>,
): message is Message<T> & { headers: { txids?: Array<Txid> } } {
  return `txids` in message.headers && Array.isArray(message.headers.txids)
}

/**
 * Creates a deduplicated loadSubset handler for progressive/on-demand modes
 * Returns null for eager mode, or a DeduplicatedLoadSubset instance for other modes.
 * Handles fetching snapshots in progressive mode during buffering phase,
 * and requesting snapshots in on-demand mode.
 *
 * When cursor expressions are provided (whereFrom/whereCurrent), makes two
 * requestSnapshot calls:
 * - One for whereFrom (rows > cursor) with limit
 * - One for whereCurrent (rows = cursor, for tie-breaking) without limit
 */
function createLoadSubsetDedupe<T extends Row<unknown>>({
  stream,
  syncMode,
  isBufferingInitialSync,
  begin,
  write,
  commit,
  collectionId,
}: {
  stream: ShapeStream<T>
  syncMode: ElectricSyncMode
  isBufferingInitialSync: () => boolean
  begin: () => void
  write: (mutation: {
    type: `insert` | `update` | `delete`
    value: T
    metadata: Record<string, unknown>
  }) => void
  commit: () => void
  collectionId?: string
}): DeduplicatedLoadSubset | null {
  // Eager mode doesn't need subset loading
  if (syncMode === `eager`) {
    return null
  }

  const loadSubset = async (opts: LoadSubsetOptions) => {
    // In progressive mode, use fetchSnapshot during snapshot phase
    if (isBufferingInitialSync()) {
      // Progressive mode snapshot phase: fetch and apply immediately
      const snapshotParams = compileSQL<T>(opts)
      try {
        const { data: rows } = await stream.fetchSnapshot(snapshotParams)

        // Check again if we're still buffering - we might have received up-to-date
        // and completed the atomic swap while waiting for the snapshot
        if (!isBufferingInitialSync()) {
          debug(
            `${collectionId ? `[${collectionId}] ` : ``}Ignoring snapshot - sync completed while fetching`,
          )
          return
        }

        // Apply snapshot data in a sync transaction (only if we have data)
        if (rows.length > 0) {
          begin()
          for (const row of rows) {
            write({
              type: `insert`,
              value: row.value,
              metadata: {
                ...row.headers,
              },
            })
          }
          commit()

          debug(
            `${collectionId ? `[${collectionId}] ` : ``}Applied snapshot with ${rows.length} rows`,
          )
        }
      } catch (error) {
        debug(
          `${collectionId ? `[${collectionId}] ` : ``}Error fetching snapshot: %o`,
          error,
        )
        throw error
      }
    } else if (syncMode === `progressive`) {
      // Progressive mode after full sync complete: no need to load more
      return
    } else {
      // On-demand mode: use requestSnapshot
      // When cursor is provided, make two calls:
      // 1. whereCurrent (all ties, no limit)
      // 2. whereFrom (rows > cursor, with limit)
      const { cursor, where, orderBy, limit } = opts

      if (cursor) {
        // Make parallel requests for cursor-based pagination
        const promises: Array<Promise<unknown>> = []

        // Request 1: All rows matching whereCurrent (ties at boundary, no limit)
        // Combine main where with cursor.whereCurrent
        const whereCurrentOpts: LoadSubsetOptions = {
          where: where ? and(where, cursor.whereCurrent) : cursor.whereCurrent,
          orderBy,
          // No limit - get all ties
        }
        const whereCurrentParams = compileSQL<T>(whereCurrentOpts)
        promises.push(stream.requestSnapshot(whereCurrentParams))

        debug(
          `${collectionId ? `[${collectionId}] ` : ``}Requesting cursor.whereCurrent snapshot (all ties)`,
        )

        // Request 2: Rows matching whereFrom (rows > cursor, with limit)
        // Combine main where with cursor.whereFrom
        const whereFromOpts: LoadSubsetOptions = {
          where: where ? and(where, cursor.whereFrom) : cursor.whereFrom,
          orderBy,
          limit,
        }
        const whereFromParams = compileSQL<T>(whereFromOpts)
        promises.push(stream.requestSnapshot(whereFromParams))

        debug(
          `${collectionId ? `[${collectionId}] ` : ``}Requesting cursor.whereFrom snapshot (with limit ${limit})`,
        )

        // Wait for both requests to complete
        await Promise.all(promises)
      } else {
        // No cursor - standard single request
        const snapshotParams = compileSQL<T>(opts)
        await stream.requestSnapshot(snapshotParams)
      }
    }
  }

  return new DeduplicatedLoadSubset({ loadSubset })
}

/**
 * Type for the awaitTxId utility function
 */
export type AwaitTxIdFn = (txId: Txid, timeout?: number) => Promise<boolean>

/**
 * Type for the awaitMatch utility function
 */
export type AwaitMatchFn<T extends Row<unknown>> = (
  matchFn: MatchFunction<T>,
  timeout?: number,
) => Promise<boolean>

/**
 * Electric collection utilities type
 */
export interface ElectricCollectionUtils<
  T extends Row<unknown> = Row<unknown>,
> extends UtilsRecord {
  awaitTxId: AwaitTxIdFn
  awaitMatch: AwaitMatchFn<T>
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

// Overload for when schema is provided
export function electricCollectionOptions<T extends StandardSchemaV1>(
  config: ElectricCollectionConfig<InferSchemaOutput<T>, T> & {
    schema: T
  },
): Omit<CollectionConfig<InferSchemaOutput<T>, string | number, T>, `utils`> & {
  id?: string
  utils: ElectricCollectionUtils<InferSchemaOutput<T>>
  schema: T
}

// Overload for when no schema is provided
export function electricCollectionOptions<T extends Row<unknown>>(
  config: ElectricCollectionConfig<T> & {
    schema?: never // prohibit schema
  },
): Omit<CollectionConfig<T, string | number>, `utils`> & {
  id?: string
  utils: ElectricCollectionUtils<T>
  schema?: never // no schema in the result
}

export function electricCollectionOptions<T extends Row<unknown>>(
  config: ElectricCollectionConfig<T, any>,
): Omit<
  CollectionConfig<T, string | number, any, ElectricCollectionUtils<T>>,
  `utils`
> & {
  id?: string
  utils: ElectricCollectionUtils<T>
  schema?: any
} {
  const seenTxids = new Store<Set<Txid>>(new Set([]))
  const seenSnapshots = new Store<Array<PostgresSnapshot>>([])
  const internalSyncMode = config.syncMode ?? `eager`
  const finalSyncMode =
    internalSyncMode === `progressive` ? `on-demand` : internalSyncMode
  const pendingMatches = new Store<
    Map<
      string,
      {
        matchFn: (message: Message<any>) => boolean
        resolve: (value: boolean) => void
        reject: (error: Error) => void
        timeoutId: ReturnType<typeof setTimeout>
        matched: boolean
      }
    >
  >(new Map())

  // Buffer messages since last up-to-date to handle race conditions
  const currentBatchMessages = new Store<Array<Message<any>>>([])

  // Track whether the current batch has been committed (up-to-date received)
  // This allows awaitMatch to resolve immediately for messages from committed batches
  const batchCommitted = new Store<boolean>(false)

  /**
   * Helper function to remove multiple matches from the pendingMatches store
   */
  const removePendingMatches = (matchIds: Array<string>) => {
    if (matchIds.length > 0) {
      pendingMatches.setState((current) => {
        const newMatches = new Map(current)
        matchIds.forEach((id) => newMatches.delete(id))
        return newMatches
      })
    }
  }

  /**
   * Helper function to resolve and cleanup matched pending matches
   */
  const resolveMatchedPendingMatches = () => {
    const matchesToResolve: Array<string> = []
    pendingMatches.state.forEach((match, matchId) => {
      if (match.matched) {
        clearTimeout(match.timeoutId)
        match.resolve(true)
        matchesToResolve.push(matchId)
        debug(
          `${config.id ? `[${config.id}] ` : ``}awaitMatch resolved on up-to-date for match %s`,
          matchId,
        )
      }
    })
    removePendingMatches(matchesToResolve)
  }
  const sync = createElectricSync<T>(config.shapeOptions, {
    seenTxids,
    seenSnapshots,
    syncMode: internalSyncMode,
    pendingMatches,
    currentBatchMessages,
    batchCommitted,
    removePendingMatches,
    resolveMatchedPendingMatches,
    collectionId: config.id,
    testHooks: config[ELECTRIC_TEST_HOOKS],
  })

  /**
   * Wait for a specific transaction ID to be synced
   * @param txId The transaction ID to wait for as a number
   * @param timeout Optional timeout in milliseconds (defaults to 5000ms)
   * @returns Promise that resolves when the txId is synced
   */
  const awaitTxId: AwaitTxIdFn = async (
    txId: Txid,
    timeout: number = 5000,
  ): Promise<boolean> => {
    debug(
      `${config.id ? `[${config.id}] ` : ``}awaitTxId called with txid %d`,
      txId,
    )
    if (typeof txId !== `number`) {
      throw new ExpectedNumberInAwaitTxIdError(typeof txId, config.id)
    }

    // First check if the txid is in the seenTxids store
    const hasTxid = seenTxids.state.has(txId)
    if (hasTxid) return true

    // Then check if the txid is in any of the seen snapshots
    const hasSnapshot = seenSnapshots.state.some((snapshot) =>
      isVisibleInSnapshot(txId, snapshot),
    )
    if (hasSnapshot) return true

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribeSeenTxids()
        unsubscribeSeenSnapshots()
        reject(new TimeoutWaitingForTxIdError(txId, config.id))
      }, timeout)

      const unsubscribeSeenTxids = seenTxids.subscribe(() => {
        if (seenTxids.state.has(txId)) {
          debug(
            `${config.id ? `[${config.id}] ` : ``}awaitTxId found match for txid %o`,
            txId,
          )
          clearTimeout(timeoutId)
          unsubscribeSeenTxids()
          unsubscribeSeenSnapshots()
          resolve(true)
        }
      })

      const unsubscribeSeenSnapshots = seenSnapshots.subscribe(() => {
        const visibleSnapshot = seenSnapshots.state.find((snapshot) =>
          isVisibleInSnapshot(txId, snapshot),
        )
        if (visibleSnapshot) {
          debug(
            `${config.id ? `[${config.id}] ` : ``}awaitTxId found match for txid %o in snapshot %o`,
            txId,
            visibleSnapshot,
          )
          clearTimeout(timeoutId)
          unsubscribeSeenSnapshots()
          unsubscribeSeenTxids()
          resolve(true)
        }
      })
    })
  }

  /**
   * Wait for a custom match function to find a matching message
   * @param matchFn Function that returns true when a message matches
   * @param timeout Optional timeout in milliseconds (defaults to 5000ms)
   * @returns Promise that resolves when a matching message is found
   */
  const awaitMatch: AwaitMatchFn<any> = async (
    matchFn: MatchFunction<any>,
    timeout: number = 3000,
  ): Promise<boolean> => {
    debug(
      `${config.id ? `[${config.id}] ` : ``}awaitMatch called with custom function`,
    )

    return new Promise((resolve, reject) => {
      const matchId = Math.random().toString(36)

      const cleanupMatch = () => {
        pendingMatches.setState((current) => {
          const newMatches = new Map(current)
          newMatches.delete(matchId)
          return newMatches
        })
      }

      const onTimeout = () => {
        cleanupMatch()
        reject(new TimeoutWaitingForMatchError(config.id))
      }

      const timeoutId = setTimeout(onTimeout, timeout)

      // We need access to the stream messages to check against the match function
      // This will be handled by the sync configuration
      const checkMatch = (message: Message<any>) => {
        if (matchFn(message)) {
          debug(
            `${config.id ? `[${config.id}] ` : ``}awaitMatch found matching message, waiting for up-to-date`,
          )
          // Mark as matched but don't resolve yet - wait for up-to-date
          pendingMatches.setState((current) => {
            const newMatches = new Map(current)
            const existing = newMatches.get(matchId)
            if (existing) {
              newMatches.set(matchId, { ...existing, matched: true })
            }
            return newMatches
          })
          return true
        }
        return false
      }

      // Check against current batch messages first to handle race conditions
      for (const message of currentBatchMessages.state) {
        if (matchFn(message)) {
          // If batch is committed (up-to-date already received), resolve immediately
          // just like awaitTxId does when it finds a txid in seenTxids
          if (batchCommitted.state) {
            debug(
              `${config.id ? `[${config.id}] ` : ``}awaitMatch found immediate match in committed batch, resolving immediately`,
            )
            clearTimeout(timeoutId)
            resolve(true)
            return
          }

          // If batch is not yet committed, register match and wait for up-to-date
          debug(
            `${config.id ? `[${config.id}] ` : ``}awaitMatch found immediate match in current batch, waiting for up-to-date`,
          )
          pendingMatches.setState((current) => {
            const newMatches = new Map(current)
            newMatches.set(matchId, {
              matchFn: checkMatch,
              resolve,
              reject,
              timeoutId,
              matched: true, // Already matched, will resolve on up-to-date
            })
            return newMatches
          })
          return
        }
      }

      // Store the match function for the sync process to use
      // We'll add this to a pending matches store
      pendingMatches.setState((current) => {
        const newMatches = new Map(current)
        newMatches.set(matchId, {
          matchFn: checkMatch,
          resolve,
          reject,
          timeoutId,
          matched: false,
        })
        return newMatches
      })
    })
  }

  /**
   * Process matching strategy and wait for synchronization
   */
  const processMatchingStrategy = async (
    result: MatchingStrategy,
  ): Promise<void> => {
    // Only wait if result contains txid
    if (result && `txid` in result) {
      const timeout = result.timeout
      // Handle both single txid and array of txids
      if (Array.isArray(result.txid)) {
        await Promise.all(result.txid.map((txid) => awaitTxId(txid, timeout)))
      } else {
        await awaitTxId(result.txid, timeout)
      }
    }
    // If result is void/undefined, don't wait - mutation completes immediately
  }

  // Create wrapper handlers for direct persistence operations that handle different matching strategies
  const wrappedOnInsert = config.onInsert
    ? async (
        params: InsertMutationFnParams<
          any,
          string | number,
          ElectricCollectionUtils<T>
        >,
      ) => {
        const handlerResult = await config.onInsert!(params)
        await processMatchingStrategy(handlerResult)
        return handlerResult
      }
    : undefined

  const wrappedOnUpdate = config.onUpdate
    ? async (
        params: UpdateMutationFnParams<
          any,
          string | number,
          ElectricCollectionUtils<T>
        >,
      ) => {
        const handlerResult = await config.onUpdate!(params)
        await processMatchingStrategy(handlerResult)
        return handlerResult
      }
    : undefined

  const wrappedOnDelete = config.onDelete
    ? async (
        params: DeleteMutationFnParams<
          any,
          string | number,
          ElectricCollectionUtils<T>
        >,
      ) => {
        const handlerResult = await config.onDelete!(params)
        await processMatchingStrategy(handlerResult)
        return handlerResult
      }
    : undefined

  // Extract standard Collection config properties
  const {
    shapeOptions: _shapeOptions,
    onInsert: _onInsert,
    onUpdate: _onUpdate,
    onDelete: _onDelete,
    ...restConfig
  } = config

  return {
    ...restConfig,
    syncMode: finalSyncMode,
    sync,
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {
      awaitTxId,
      awaitMatch,
    },
  }
}

/**
 * Internal function to create ElectricSQL sync configuration
 */
function createElectricSync<T extends Row<unknown>>(
  shapeOptions: ShapeStreamOptions<GetExtensions<T>>,
  options: {
    syncMode: ElectricSyncMode
    seenTxids: Store<Set<Txid>>
    seenSnapshots: Store<Array<PostgresSnapshot>>
    pendingMatches: Store<
      Map<
        string,
        {
          matchFn: (message: Message<T>) => boolean
          resolve: (value: boolean) => void
          reject: (error: Error) => void
          timeoutId: ReturnType<typeof setTimeout>
          matched: boolean
        }
      >
    >
    currentBatchMessages: Store<Array<Message<T>>>
    batchCommitted: Store<boolean>
    removePendingMatches: (matchIds: Array<string>) => void
    resolveMatchedPendingMatches: () => void
    collectionId?: string
    testHooks?: ElectricTestHooks
  },
): SyncConfig<T> {
  const {
    seenTxids,
    seenSnapshots,
    syncMode,
    pendingMatches,
    currentBatchMessages,
    batchCommitted,
    removePendingMatches,
    resolveMatchedPendingMatches,
    collectionId,
    testHooks,
  } = options
  const MAX_BATCH_MESSAGES = 1000 // Safety limit for message buffer

  // Store for the relation schema information
  const relationSchema = new Store<string | undefined>(undefined)

  const tagCache = new Map<MoveTag, ParsedMoveTag>()

  // Parses a tag string into a MoveTag.
  // It memoizes the result parsed tag such that future calls
  // for the same tag string return the same MoveTag array.
  const parseTag = (tag: MoveTag): ParsedMoveTag => {
    const cachedTag = tagCache.get(tag)
    if (cachedTag) {
      return cachedTag
    }

    const parsedTag = tag.split(`|`)
    tagCache.set(tag, parsedTag)
    return parsedTag
  }

  // Tag tracking state
  const rowTagSets = new Map<RowId, Set<MoveTag>>()
  const tagIndex: TagIndex = []
  let tagLength: number | undefined = undefined

  /**
   * Initialize the tag index with the correct length
   */
  const initializeTagIndex = (length: number): void => {
    if (tagIndex.length < length) {
      // Extend the index array to the required length
      for (let i = tagIndex.length; i < length; i++) {
        tagIndex[i] = new Map()
      }
    }
  }

  /**
   * Add tags to a row and update the tag index
   */
  const addTagsToRow = (
    tags: Array<MoveTag>,
    rowId: RowId,
    rowTagSet: Set<MoveTag>,
  ): void => {
    for (const tag of tags) {
      const parsedTag = parseTag(tag)

      // Infer tag length from first tag
      if (tagLength === undefined) {
        tagLength = getTagLength(parsedTag)
        initializeTagIndex(tagLength)
      }

      // Validate tag length matches
      const currentTagLength = getTagLength(parsedTag)
      if (currentTagLength !== tagLength) {
        debug(
          `${collectionId ? `[${collectionId}] ` : ``}Tag length mismatch: expected ${tagLength}, got ${currentTagLength}`,
        )
        continue
      }

      rowTagSet.add(tag)
      addTagToIndex(parsedTag, rowId, tagIndex, tagLength)
    }
  }

  /**
   * Remove tags from a row and update the tag index
   */
  const removeTagsFromRow = (
    removedTags: Array<MoveTag>,
    rowId: RowId,
    rowTagSet: Set<MoveTag>,
  ): void => {
    if (tagLength === undefined) {
      return
    }

    for (const tag of removedTags) {
      const parsedTag = parseTag(tag)
      rowTagSet.delete(tag)
      removeTagFromIndex(parsedTag, rowId, tagIndex, tagLength)
      // We aggresively evict the tag from the cache
      // if this tag is shared with another row
      // and is not removed from that other row
      // then next time we encounter the tag it will be parsed again
      tagCache.delete(tag)
    }
  }

  /**
   * Process tags for a change message (add and remove tags)
   */
  const processTagsForChangeMessage = (
    tags: Array<MoveTag> | undefined,
    removedTags: Array<MoveTag> | undefined,
    rowId: RowId,
  ): Set<MoveTag> => {
    // Initialize tag set for this row if it doesn't exist (needed for checking deletion)
    if (!rowTagSets.has(rowId)) {
      rowTagSets.set(rowId, new Set())
    }
    const rowTagSet = rowTagSets.get(rowId)!

    // Add new tags
    if (tags) {
      addTagsToRow(tags, rowId, rowTagSet)
    }

    // Remove tags
    if (removedTags) {
      removeTagsFromRow(removedTags, rowId, rowTagSet)
    }

    return rowTagSet
  }

  /**
   * Clear all tag tracking state (used when truncating)
   */
  const clearTagTrackingState = (): void => {
    rowTagSets.clear()
    tagIndex.length = 0
    tagLength = undefined
  }

  /**
   * Remove all tags for a row from both the tag set and the index
   * Used when a row is deleted
   */
  const clearTagsForRow = (rowId: RowId): void => {
    if (tagLength === undefined) {
      return
    }

    const rowTagSet = rowTagSets.get(rowId)
    if (!rowTagSet) {
      return
    }

    // Remove each tag from the index
    for (const tag of rowTagSet) {
      const parsedTag = parseTag(tag)
      const currentTagLength = getTagLength(parsedTag)
      if (currentTagLength === tagLength) {
        removeTagFromIndex(parsedTag, rowId, tagIndex, tagLength)
      }
      tagCache.delete(tag)
    }

    // Remove the row from the tag sets map
    rowTagSets.delete(rowId)
  }

  /**
   * Remove matching tags from a row based on a pattern
   * Returns true if the row's tag set is now empty
   */
  const removeMatchingTagsFromRow = (
    rowId: RowId,
    pattern: MoveOutPattern,
  ): boolean => {
    const rowTagSet = rowTagSets.get(rowId)
    if (!rowTagSet) {
      return false
    }

    // Find tags that match this pattern and remove them
    for (const tag of rowTagSet) {
      const parsedTag = parseTag(tag)
      if (tagMatchesPattern(parsedTag, pattern)) {
        rowTagSet.delete(tag)
        removeTagFromIndex(parsedTag, rowId, tagIndex, tagLength!)
      }
    }

    // Check if row's tag set is now empty
    if (rowTagSet.size === 0) {
      rowTagSets.delete(rowId)
      return true
    }

    return false
  }

  /**
   * Process move-out event: remove matching tags from rows and delete rows with empty tag sets
   */
  const processMoveOutEvent = (
    patterns: Array<MoveOutPattern>,
    begin: () => void,
    write: (message: ChangeMessageOrDeleteKeyMessage<T>) => void,
    transactionStarted: boolean,
  ): boolean => {
    if (tagLength === undefined) {
      debug(
        `${collectionId ? `[${collectionId}] ` : ``}Received move-out message but no tag length set yet, ignoring`,
      )
      return transactionStarted
    }

    let txStarted = transactionStarted

    // Process all patterns and collect rows to delete
    for (const pattern of patterns) {
      // Find all rows that match this pattern
      const affectedRowIds = findRowsMatchingPattern(pattern, tagIndex)

      for (const rowId of affectedRowIds) {
        if (removeMatchingTagsFromRow(rowId, pattern)) {
          // Delete rows with empty tag sets
          if (!txStarted) {
            begin()
            txStarted = true
          }

          write({
            type: `delete`,
            key: rowId,
          })
        }
      }
    }

    return txStarted
  }

  /**
   * Get the sync metadata for insert operations
   * @returns Record containing relation information
   */
  const getSyncMetadata = (): Record<string, unknown> => {
    // Use the stored schema if available, otherwise default to 'public'
    const schema = relationSchema.state || `public`

    return {
      relation: shapeOptions.params?.table
        ? [schema, shapeOptions.params.table]
        : undefined,
    }
  }

  let unsubscribeStream: () => void

  return {
    sync: (params: Parameters<SyncConfig<T>[`sync`]>[0]) => {
      const { begin, write, commit, markReady, truncate, collection } = params

      // Wrap markReady to wait for test hook in progressive mode
      let progressiveReadyGate: Promise<void> | null = null
      const wrappedMarkReady = (isBuffering: boolean) => {
        // Only create gate if we're in buffering phase (first up-to-date)
        if (
          isBuffering &&
          syncMode === `progressive` &&
          testHooks?.beforeMarkingReady
        ) {
          // Create a new gate promise for this sync cycle
          progressiveReadyGate = testHooks.beforeMarkingReady()
          progressiveReadyGate.then(() => {
            markReady()
          })
        } else {
          // No hook, not buffering, or already past first up-to-date
          markReady()
        }
      }

      // Abort controller for the stream - wraps the signal if provided
      const abortController = new AbortController()

      if (shapeOptions.signal) {
        shapeOptions.signal.addEventListener(
          `abort`,
          () => {
            abortController.abort()
          },
          {
            once: true,
          },
        )
        if (shapeOptions.signal.aborted) {
          abortController.abort()
        }
      }

      // Cleanup pending matches on abort
      abortController.signal.addEventListener(`abort`, () => {
        pendingMatches.setState((current) => {
          current.forEach((match) => {
            clearTimeout(match.timeoutId)
            match.reject(new StreamAbortedError())
          })
          return new Map() // Clear all pending matches
        })
      })

      const stream = new ShapeStream({
        ...shapeOptions,
        // In on-demand mode, we only want to sync changes, so we set the log to `changes_only`
        log: syncMode === `on-demand` ? `changes_only` : undefined,
        // In on-demand mode, we only need the changes from the point of time the collection was created
        // so we default to `now` when there is no saved offset.
        offset:
          shapeOptions.offset ?? (syncMode === `on-demand` ? `now` : undefined),
        signal: abortController.signal,
        onError: (errorParams) => {
          // Just immediately mark ready if there's an error to avoid blocking
          // apps waiting for `.preload()` to finish.
          // Note that Electric sends a 409 error on a `must-refetch` message, but the
          // ShapeStream handled this and it will not reach this handler, therefor
          // this markReady will not be triggers by a `must-refetch`.
          markReady()

          if (shapeOptions.onError) {
            return shapeOptions.onError(errorParams)
          } else {
            console.error(
              `An error occurred while syncing collection: ${collection.id}, \n` +
                `it has been marked as ready to avoid blocking apps waiting for '.preload()' to finish. \n` +
                `You can provide an 'onError' handler on the shapeOptions to handle this error, and this message will not be logged.`,
              errorParams,
            )
          }

          return
        },
      })
      let transactionStarted = false
      const newTxids = new Set<Txid>()
      const newSnapshots: Array<PostgresSnapshot> = []
      let hasReceivedUpToDate = false // Track if we've completed initial sync in progressive mode

      // Progressive mode state
      // Helper to determine if we're buffering the initial sync
      const isBufferingInitialSync = () =>
        syncMode === `progressive` && !hasReceivedUpToDate
      const bufferedMessages: Array<Message<T>> = [] // Buffer change messages during initial sync

      /**
       * Process a change message: handle tags and write the mutation
       */
      const processChangeMessage = (changeMessage: Message<T>) => {
        if (!isChangeMessage(changeMessage)) {
          return
        }

        // Process tags if present
        const tags = changeMessage.headers.tags
        const removedTags = changeMessage.headers.removed_tags
        const hasTags = tags || removedTags

        const rowId = collection.getKeyFromItem(changeMessage.value)
        const operation = changeMessage.headers.operation

        if (operation === `delete`) {
          clearTagsForRow(rowId)
        } else if (hasTags) {
          processTagsForChangeMessage(tags, removedTags, rowId)
        }

        write({
          type: changeMessage.headers.operation,
          value: changeMessage.value,
          // Include the primary key and relation info in the metadata
          metadata: {
            ...changeMessage.headers,
          },
        })
      }

      // Create deduplicated loadSubset wrapper for non-eager modes
      // This prevents redundant snapshot requests when multiple concurrent
      // live queries request overlapping or subset predicates
      const loadSubsetDedupe = createLoadSubsetDedupe({
        stream,
        syncMode,
        isBufferingInitialSync,
        begin,
        write,
        commit,
        collectionId,
      })

      unsubscribeStream = stream.subscribe((messages: Array<Message<T>>) => {
        // Track commit point type - up-to-date takes precedence as it also triggers progressive mode atomic swap
        let commitPoint: `up-to-date` | `subset-end` | null = null

        // Don't clear the buffer between batches - this preserves messages for awaitMatch
        // to find even if multiple batches arrive before awaitMatch is called.
        // The buffer is naturally limited by MAX_BATCH_MESSAGES (oldest messages are dropped).
        // Reset batchCommitted since we're starting a new batch
        batchCommitted.setState(() => false)

        for (const message of messages) {
          // Add message to current batch buffer (for race condition handling)
          if (isChangeMessage(message) || isMoveOutMessage(message)) {
            currentBatchMessages.setState((currentBuffer) => {
              const newBuffer = [...currentBuffer, message]
              // Limit buffer size for safety
              if (newBuffer.length > MAX_BATCH_MESSAGES) {
                newBuffer.splice(0, newBuffer.length - MAX_BATCH_MESSAGES)
              }
              return newBuffer
            })
          }

          // Check for txids in the message and add them to our store
          // Skip during buffered initial sync in progressive mode (txids will be extracted during atomic swap)
          if (hasTxids(message) && !isBufferingInitialSync()) {
            message.headers.txids?.forEach((txid) => newTxids.add(txid))
          }

          // Check pending matches against this message
          // Note: matchFn will mark matches internally, we don't resolve here
          const matchesToRemove: Array<string> = []
          pendingMatches.state.forEach((match, matchId) => {
            if (!match.matched) {
              try {
                match.matchFn(message)
              } catch (err) {
                // If matchFn throws, clean up and reject the promise
                clearTimeout(match.timeoutId)
                match.reject(
                  err instanceof Error ? err : new Error(String(err)),
                )
                matchesToRemove.push(matchId)
                debug(`matchFn error: %o`, err)
              }
            }
          })

          // Remove matches that errored
          removePendingMatches(matchesToRemove)

          if (isChangeMessage(message)) {
            // Check if the message contains schema information
            const schema = message.headers.schema
            if (schema && typeof schema === `string`) {
              // Store the schema for future use if it's a valid string
              relationSchema.setState(() => schema)
            }

            // In buffered initial sync of progressive mode, buffer messages instead of writing
            if (isBufferingInitialSync()) {
              bufferedMessages.push(message)
            } else {
              // Normal processing: write changes immediately
              if (!transactionStarted) {
                begin()
                transactionStarted = true
              }

              processChangeMessage(message)
            }
          } else if (isSnapshotEndMessage(message)) {
            // Track postgres snapshot metadata for resolving awaiting mutations
            // Skip during buffered initial sync (will be extracted during atomic swap)
            if (!isBufferingInitialSync()) {
              newSnapshots.push(parseSnapshotMessage(message))
            }
          } else if (isUpToDateMessage(message)) {
            // up-to-date takes precedence - also triggers progressive mode atomic swap
            commitPoint = `up-to-date`
          } else if (isSubsetEndMessage(message)) {
            // subset-end triggers commit but not progressive mode atomic swap
            if (commitPoint !== `up-to-date`) {
              commitPoint = `subset-end`
            }
          } else if (isMoveOutMessage(message)) {
            // Handle move-out event: buffer if buffering, otherwise process immediately
            if (isBufferingInitialSync()) {
              bufferedMessages.push(message)
            } else {
              // Normal processing: process move-out immediately
              transactionStarted = processMoveOutEvent(
                message.headers.patterns,
                begin,
                write,
                transactionStarted,
              )
            }
          } else if (isMustRefetchMessage(message)) {
            debug(
              `${collectionId ? `[${collectionId}] ` : ``}Received must-refetch message, starting transaction with truncate`,
            )

            // Start a transaction and truncate the collection
            if (!transactionStarted) {
              begin()
              transactionStarted = true
            }

            truncate()

            // Clear tag tracking state
            clearTagTrackingState()

            // Reset the loadSubset deduplication state since we're starting fresh
            // This ensures that previously loaded predicates don't prevent refetching after truncate
            loadSubsetDedupe?.reset()

            // Reset flags so we continue accumulating changes until next up-to-date
            commitPoint = null
            hasReceivedUpToDate = false // Reset for progressive mode (isBufferingInitialSync will reflect this)
            bufferedMessages.length = 0 // Clear buffered messages
          }
        }

        if (commitPoint !== null) {
          // PROGRESSIVE MODE: Atomic swap on first up-to-date (not subset-end)
          if (isBufferingInitialSync() && commitPoint === `up-to-date`) {
            debug(
              `${collectionId ? `[${collectionId}] ` : ``}Progressive mode: Performing atomic swap with ${bufferedMessages.length} buffered messages`,
            )

            // Start atomic swap transaction
            begin()

            // Truncate to clear all snapshot data
            truncate()

            // Clear tag tracking state for atomic swap
            clearTagTrackingState()

            // Apply all buffered change messages and extract txids/snapshots
            for (const bufferedMsg of bufferedMessages) {
              if (isChangeMessage(bufferedMsg)) {
                processChangeMessage(bufferedMsg)

                // Extract txids from buffered messages (will be committed to store after transaction)
                if (hasTxids(bufferedMsg)) {
                  bufferedMsg.headers.txids?.forEach((txid) =>
                    newTxids.add(txid),
                  )
                }
              } else if (isSnapshotEndMessage(bufferedMsg)) {
                // Extract snapshots from buffered messages (will be committed to store after transaction)
                newSnapshots.push(parseSnapshotMessage(bufferedMsg))
              } else if (isMoveOutMessage(bufferedMsg)) {
                // Process buffered move-out messages during atomic swap
                processMoveOutEvent(
                  bufferedMsg.headers.patterns,
                  begin,
                  write,
                  transactionStarted,
                )
              }
            }

            // Commit the atomic swap
            commit()

            // Exit buffering phase by marking that we've received up-to-date
            // isBufferingInitialSync() will now return false
            bufferedMessages.length = 0

            debug(
              `${collectionId ? `[${collectionId}] ` : ``}Progressive mode: Atomic swap complete, now in normal sync mode`,
            )
          } else {
            // Normal mode or on-demand: commit transaction if one was started
            // Both up-to-date and subset-end trigger a commit
            if (transactionStarted) {
              commit()
              transactionStarted = false
            }
          }
          wrappedMarkReady(isBufferingInitialSync())

          // Track that we've received the first up-to-date for progressive mode
          if (commitPoint === `up-to-date`) {
            hasReceivedUpToDate = true
          }

          // Always commit txids when we receive up-to-date, regardless of transaction state
          seenTxids.setState((currentTxids) => {
            const clonedSeen = new Set<Txid>(currentTxids)
            if (newTxids.size > 0) {
              debug(
                `${collectionId ? `[${collectionId}] ` : ``}new txids synced from pg %O`,
                Array.from(newTxids),
              )
            }
            newTxids.forEach((txid) => clonedSeen.add(txid))
            newTxids.clear()
            return clonedSeen
          })

          // Always commit snapshots when we receive up-to-date, regardless of transaction state
          seenSnapshots.setState((currentSnapshots) => {
            const seen = [...currentSnapshots, ...newSnapshots]
            newSnapshots.forEach((snapshot) =>
              debug(
                `${collectionId ? `[${collectionId}] ` : ``}new snapshot synced from pg %o`,
                snapshot,
              ),
            )
            newSnapshots.length = 0
            return seen
          })

          // Resolve all matched pending matches on up-to-date or subset-end
          // Set batchCommitted BEFORE resolving to avoid timing window where late awaitMatch
          // calls could register as "matched" after resolver pass already ran
          batchCommitted.setState(() => true)

          resolveMatchedPendingMatches()
        }
      })

      // Return the deduplicated loadSubset if available (on-demand or progressive mode)
      // The loadSubset method is auto-bound, so it can be safely returned directly
      return {
        loadSubset: loadSubsetDedupe?.loadSubset,
        cleanup: () => {
          // Unsubscribe from the stream
          unsubscribeStream()
          // Abort the abort controller to stop the stream
          abortController.abort()
          // Reset deduplication tracking so collection can load fresh data if restarted
          loadSubsetDedupe?.reset()
        },
      }
    },
    // Expose the getSyncMetadata function
    getSyncMetadata,
  }
}
