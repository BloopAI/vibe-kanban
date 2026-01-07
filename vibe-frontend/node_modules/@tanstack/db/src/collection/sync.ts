import {
  CollectionConfigurationError,
  CollectionIsInErrorStateError,
  DuplicateKeySyncError,
  NoPendingSyncTransactionCommitError,
  NoPendingSyncTransactionWriteError,
  SyncCleanupError,
  SyncTransactionAlreadyCommittedError,
  SyncTransactionAlreadyCommittedWriteError,
} from '../errors'
import { deepEquals } from '../utils'
import { LIVE_QUERY_INTERNAL } from '../query/live/internal.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ChangeMessageOrDeleteKeyMessage,
  CleanupFn,
  CollectionConfig,
  LoadSubsetOptions,
  OptimisticChangeMessage,
  SyncConfigRes,
} from '../types'
import type { CollectionImpl } from './index.js'
import type { CollectionStateManager } from './state'
import type { CollectionLifecycleManager } from './lifecycle'
import type { CollectionEventsManager } from './events.js'
import type { LiveQueryCollectionUtils } from '../query/live/collection-config-builder.js'

export class CollectionSyncManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  private collection!: CollectionImpl<TOutput, TKey, any, TSchema, TInput>
  private state!: CollectionStateManager<TOutput, TKey, TSchema, TInput>
  private lifecycle!: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  private _events!: CollectionEventsManager
  private config!: CollectionConfig<TOutput, TKey, TSchema>
  private id: string
  private syncMode: `eager` | `on-demand`

  public preloadPromise: Promise<void> | null = null
  public syncCleanupFn: (() => void) | null = null
  public syncLoadSubsetFn:
    | ((options: LoadSubsetOptions) => true | Promise<void>)
    | null = null
  public syncUnloadSubsetFn: ((options: LoadSubsetOptions) => void) | null =
    null

  private pendingLoadSubsetPromises: Set<Promise<void>> = new Set()

  /**
   * Creates a new CollectionSyncManager instance
   */
  constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string) {
    this.config = config
    this.id = id
    this.syncMode = config.syncMode ?? `eager`
  }

  setDeps(deps: {
    collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>
    state: CollectionStateManager<TOutput, TKey, TSchema, TInput>
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
    events: CollectionEventsManager
  }) {
    this.collection = deps.collection
    this.state = deps.state
    this.lifecycle = deps.lifecycle
    this._events = deps.events
  }

  /**
   * Start the sync process for this collection
   * This is called when the collection is first accessed or preloaded
   */
  public startSync(): void {
    if (
      this.lifecycle.status !== `idle` &&
      this.lifecycle.status !== `cleaned-up`
    ) {
      return // Already started or in progress
    }

    this.lifecycle.setStatus(`loading`)

    try {
      const syncRes = normalizeSyncFnResult(
        this.config.sync.sync({
          collection: this.collection,
          begin: () => {
            this.state.pendingSyncedTransactions.push({
              committed: false,
              operations: [],
              deletedKeys: new Set(),
            })
          },
          write: (
            messageWithOptionalKey: ChangeMessageOrDeleteKeyMessage<
              TOutput,
              TKey
            >,
          ) => {
            const pendingTransaction =
              this.state.pendingSyncedTransactions[
                this.state.pendingSyncedTransactions.length - 1
              ]
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionWriteError()
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedWriteError()
            }

            let key: TKey | undefined = undefined
            if (`key` in messageWithOptionalKey) {
              key = messageWithOptionalKey.key
            } else {
              key = this.config.getKey(messageWithOptionalKey.value)
            }

            let messageType = messageWithOptionalKey.type

            // Check if an item with this key already exists when inserting
            if (messageWithOptionalKey.type === `insert`) {
              const insertingIntoExistingSynced = this.state.syncedData.has(key)
              const hasPendingDeleteForKey =
                pendingTransaction.deletedKeys.has(key)
              const isTruncateTransaction = pendingTransaction.truncate === true
              // Allow insert after truncate in the same transaction even if it existed in syncedData
              if (
                insertingIntoExistingSynced &&
                !hasPendingDeleteForKey &&
                !isTruncateTransaction
              ) {
                const existingValue = this.state.syncedData.get(key)
                if (
                  existingValue !== undefined &&
                  deepEquals(existingValue, messageWithOptionalKey.value)
                ) {
                  // The "insert" is an echo of a value we already have locally.
                  // Treat it as an update so we preserve optimistic intent without
                  // throwing a duplicate-key error during reconciliation.
                  messageType = `update`
                } else {
                  const utils = this.config
                    .utils as Partial<LiveQueryCollectionUtils>
                  const internal = utils[LIVE_QUERY_INTERNAL]
                  throw new DuplicateKeySyncError(key, this.id, {
                    hasCustomGetKey: internal?.hasCustomGetKey ?? false,
                    hasJoins: internal?.hasJoins ?? false,
                  })
                }
              }
            }

            const message = {
              ...messageWithOptionalKey,
              type: messageType,
              key,
            } as OptimisticChangeMessage<TOutput, TKey>
            pendingTransaction.operations.push(message)

            if (messageType === `delete`) {
              pendingTransaction.deletedKeys.add(key)
            }
          },
          commit: () => {
            const pendingTransaction =
              this.state.pendingSyncedTransactions[
                this.state.pendingSyncedTransactions.length - 1
              ]
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionCommitError()
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedError()
            }

            pendingTransaction.committed = true

            this.state.commitPendingTransactions()
          },
          markReady: () => {
            this.lifecycle.markReady()
          },
          truncate: () => {
            const pendingTransaction =
              this.state.pendingSyncedTransactions[
                this.state.pendingSyncedTransactions.length - 1
              ]
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionWriteError()
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedWriteError()
            }

            // Clear all operations from the current transaction
            pendingTransaction.operations = []
            pendingTransaction.deletedKeys.clear()

            // Mark the transaction as a truncate operation. During commit, this triggers:
            // - Delete events for all previously synced keys (excluding optimistic-deleted keys)
            // - Clearing of syncedData/syncedMetadata
            // - Subsequent synced ops applied on the fresh base
            // - Finally, optimistic mutations re-applied on top (single batch)
            pendingTransaction.truncate = true

            // Capture optimistic state NOW to preserve it even if transactions complete
            // before this truncate transaction is committed
            pendingTransaction.optimisticSnapshot = {
              upserts: new Map(this.state.optimisticUpserts),
              deletes: new Set(this.state.optimisticDeletes),
            }
          },
        }),
      )

      // Store cleanup function if provided
      this.syncCleanupFn = syncRes?.cleanup ?? null

      // Store loadSubset function if provided
      this.syncLoadSubsetFn = syncRes?.loadSubset ?? null

      // Store unloadSubset function if provided
      this.syncUnloadSubsetFn = syncRes?.unloadSubset ?? null

      // Validate: on-demand mode requires a loadSubset function
      if (this.syncMode === `on-demand` && !this.syncLoadSubsetFn) {
        throw new CollectionConfigurationError(
          `Collection "${this.id}" is configured with syncMode "on-demand" but the sync function did not return a loadSubset handler. ` +
            `Either provide a loadSubset handler or use syncMode "eager".`,
        )
      }
    } catch (error) {
      this.lifecycle.setStatus(`error`)
      throw error
    }
  }

  /**
   * Preload the collection data by starting sync if not already started
   * Multiple concurrent calls will share the same promise
   */
  public preload(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise
    }

    // Warn when calling preload on an on-demand collection
    if (this.syncMode === `on-demand`) {
      console.warn(
        `${this.id ? `[${this.id}] ` : ``}Calling .preload() on a collection with syncMode "on-demand" is a no-op. ` +
          `In on-demand mode, data is only loaded when queries request it. ` +
          `Instead, create a live query and call .preload() on that to load the specific data you need. ` +
          `See https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync for more details.`,
      )
    }

    this.preloadPromise = new Promise<void>((resolve, reject) => {
      if (this.lifecycle.status === `ready`) {
        resolve()
        return
      }

      if (this.lifecycle.status === `error`) {
        reject(new CollectionIsInErrorStateError())
        return
      }

      // Register callback BEFORE starting sync to avoid race condition
      this.lifecycle.onFirstReady(() => {
        resolve()
      })

      // Start sync if collection hasn't started yet or was cleaned up
      if (
        this.lifecycle.status === `idle` ||
        this.lifecycle.status === `cleaned-up`
      ) {
        try {
          this.startSync()
        } catch (error) {
          reject(error)
          return
        }
      }
    })

    return this.preloadPromise
  }

  /**
   * Gets whether the collection is currently loading more data
   */
  public get isLoadingSubset(): boolean {
    return this.pendingLoadSubsetPromises.size > 0
  }

  /**
   * Tracks a load promise for isLoadingSubset state.
   * @internal This is for internal coordination (e.g., live-query glue code), not for general use.
   */
  public trackLoadPromise(promise: Promise<void>): void {
    const loadingStarting = !this.isLoadingSubset
    this.pendingLoadSubsetPromises.add(promise)

    if (loadingStarting) {
      this._events.emit(`loadingSubset:change`, {
        type: `loadingSubset:change`,
        collection: this.collection,
        isLoadingSubset: true,
        previousIsLoadingSubset: false,
        loadingSubsetTransition: `start`,
      })
    }

    promise.finally(() => {
      const loadingEnding =
        this.pendingLoadSubsetPromises.size === 1 &&
        this.pendingLoadSubsetPromises.has(promise)
      this.pendingLoadSubsetPromises.delete(promise)

      if (loadingEnding) {
        this._events.emit(`loadingSubset:change`, {
          type: `loadingSubset:change`,
          collection: this.collection,
          isLoadingSubset: false,
          previousIsLoadingSubset: true,
          loadingSubsetTransition: `end`,
        })
      }
    })
  }

  /**
   * Requests the sync layer to load more data.
   * @param options Options to control what data is being loaded
   * @returns If data loading is asynchronous, this method returns a promise that resolves when the data is loaded.
   *          Returns true if no sync function is configured, if syncMode is 'eager', or if there is no work to do.
   */
  public loadSubset(options: LoadSubsetOptions): Promise<void> | true {
    // Bypass loadSubset when syncMode is 'eager'
    if (this.syncMode === `eager`) {
      return true
    }

    if (this.syncLoadSubsetFn) {
      const result = this.syncLoadSubsetFn(options)
      // If the result is a promise, track it
      if (result instanceof Promise) {
        this.trackLoadPromise(result)
        return result
      }
    }

    return true
  }

  /**
   * Notifies the sync layer that a subset is no longer needed.
   * @param options Options that identify what data is being unloaded
   */
  public unloadSubset(options: LoadSubsetOptions): void {
    if (this.syncUnloadSubsetFn) {
      this.syncUnloadSubsetFn(options)
    }
  }

  public cleanup(): void {
    try {
      if (this.syncCleanupFn) {
        this.syncCleanupFn()
        this.syncCleanupFn = null
      }
    } catch (error) {
      // Re-throw in a microtask to surface the error after cleanup completes
      queueMicrotask(() => {
        if (error instanceof Error) {
          // Preserve the original error and stack trace
          const wrappedError = new SyncCleanupError(this.id, error)
          wrappedError.cause = error
          wrappedError.stack = error.stack
          throw wrappedError
        } else {
          throw new SyncCleanupError(this.id, error as Error | string)
        }
      })
    }
    this.preloadPromise = null
  }
}

function normalizeSyncFnResult(result: void | CleanupFn | SyncConfigRes) {
  if (typeof result === `function`) {
    return { cleanup: result }
  }

  if (typeof result === `object`) {
    return result
  }

  return undefined
}
