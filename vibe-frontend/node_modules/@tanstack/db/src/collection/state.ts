import { deepEquals } from '../utils'
import { SortedMap } from '../SortedMap'
import type { Transaction } from '../transactions'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type {
  ChangeMessage,
  CollectionConfig,
  OptimisticChangeMessage,
} from '../types'
import type { CollectionImpl } from './index.js'
import type { CollectionLifecycleManager } from './lifecycle'
import type { CollectionChangesManager } from './changes'
import type { CollectionIndexesManager } from './indexes'
import type { CollectionEventsManager } from './events'

interface PendingSyncedTransaction<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
> {
  committed: boolean
  operations: Array<OptimisticChangeMessage<T>>
  truncate?: boolean
  deletedKeys: Set<string | number>
  optimisticSnapshot?: {
    upserts: Map<TKey, T>
    deletes: Set<TKey>
  }
}

export class CollectionStateManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  public config!: CollectionConfig<TOutput, TKey, TSchema>
  public collection!: CollectionImpl<TOutput, TKey, any, TSchema, TInput>
  public lifecycle!: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  public changes!: CollectionChangesManager<TOutput, TKey, TSchema, TInput>
  public indexes!: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>
  private _events!: CollectionEventsManager

  // Core state - make public for testing
  public transactions: SortedMap<string, Transaction<any>>
  public pendingSyncedTransactions: Array<
    PendingSyncedTransaction<TOutput, TKey>
  > = []
  public syncedData: SortedMap<TKey, TOutput>
  public syncedMetadata = new Map<TKey, unknown>()

  // Optimistic state tracking - make public for testing
  public optimisticUpserts = new Map<TKey, TOutput>()
  public optimisticDeletes = new Set<TKey>()

  // Cached size for performance
  public size = 0

  // State used for computing the change events
  public syncedKeys = new Set<TKey>()
  public preSyncVisibleState = new Map<TKey, TOutput>()
  public recentlySyncedKeys = new Set<TKey>()
  public hasReceivedFirstCommit = false
  public isCommittingSyncTransactions = false

  /**
   * Creates a new CollectionState manager
   */
  constructor(config: CollectionConfig<TOutput, TKey, TSchema>) {
    this.config = config
    this.transactions = new SortedMap<string, Transaction<any>>((a, b) =>
      a.compareCreatedAt(b),
    )

    // Set up data storage - always use SortedMap for deterministic iteration.
    // If a custom compare function is provided, use it; otherwise entries are sorted by key only.
    this.syncedData = new SortedMap<TKey, TOutput>(config.compare)
  }

  setDeps(deps: {
    collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
    changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>
    indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>
    events: CollectionEventsManager
  }) {
    this.collection = deps.collection
    this.lifecycle = deps.lifecycle
    this.changes = deps.changes
    this.indexes = deps.indexes
    this._events = deps.events
  }

  /**
   * Get the current value for a key (virtual derived state)
   */
  public get(key: TKey): TOutput | undefined {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this
    // Check if optimistically deleted
    if (optimisticDeletes.has(key)) {
      return undefined
    }

    // Check optimistic upserts first
    if (optimisticUpserts.has(key)) {
      return optimisticUpserts.get(key)
    }

    // Fall back to synced data
    return syncedData.get(key)
  }

  /**
   * Check if a key exists in the collection (virtual derived state)
   */
  public has(key: TKey): boolean {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this
    // Check if optimistically deleted
    if (optimisticDeletes.has(key)) {
      return false
    }

    // Check optimistic upserts first
    if (optimisticUpserts.has(key)) {
      return true
    }

    // Fall back to synced data
    return syncedData.has(key)
  }

  /**
   * Get all keys (virtual derived state)
   */
  public *keys(): IterableIterator<TKey> {
    const { syncedData, optimisticDeletes, optimisticUpserts } = this
    // Yield keys from synced data, skipping any that are deleted.
    for (const key of syncedData.keys()) {
      if (!optimisticDeletes.has(key)) {
        yield key
      }
    }
    // Yield keys from upserts that were not already in synced data.
    for (const key of optimisticUpserts.keys()) {
      if (!syncedData.has(key) && !optimisticDeletes.has(key)) {
        // The optimisticDeletes check is technically redundant if inserts/updates always remove from deletes,
        // but it's safer to keep it.
        yield key
      }
    }
  }

  /**
   * Get all values (virtual derived state)
   */
  public *values(): IterableIterator<TOutput> {
    for (const key of this.keys()) {
      const value = this.get(key)
      if (value !== undefined) {
        yield value
      }
    }
  }

  /**
   * Get all entries (virtual derived state)
   */
  public *entries(): IterableIterator<[TKey, TOutput]> {
    for (const key of this.keys()) {
      const value = this.get(key)
      if (value !== undefined) {
        yield [key, value]
      }
    }
  }

  /**
   * Get all entries (virtual derived state)
   */
  public *[Symbol.iterator](): IterableIterator<[TKey, TOutput]> {
    for (const [key, value] of this.entries()) {
      yield [key, value]
    }
  }

  /**
   * Execute a callback for each entry in the collection
   */
  public forEach(
    callbackfn: (value: TOutput, key: TKey, index: number) => void,
  ): void {
    let index = 0
    for (const [key, value] of this.entries()) {
      callbackfn(value, key, index++)
    }
  }

  /**
   * Create a new array with the results of calling a function for each entry in the collection
   */
  public map<U>(
    callbackfn: (value: TOutput, key: TKey, index: number) => U,
  ): Array<U> {
    const result: Array<U> = []
    let index = 0
    for (const [key, value] of this.entries()) {
      result.push(callbackfn(value, key, index++))
    }
    return result
  }

  /**
   * Check if the given collection is this collection
   * @param collection The collection to check
   * @returns True if the given collection is this collection, false otherwise
   */
  private isThisCollection(
    collection: CollectionImpl<any, any, any, any, any>,
  ): boolean {
    return collection === this.collection
  }

  /**
   * Recompute optimistic state from active transactions
   */
  public recomputeOptimisticState(
    triggeredByUserAction: boolean = false,
  ): void {
    // Skip redundant recalculations when we're in the middle of committing sync transactions
    // While the sync pipeline is replaying a large batch we still want to honour
    // fresh optimistic mutations from the UI. Only skip recompute for the
    // internal sync-driven redraws; user-triggered work (triggeredByUserAction)
    // must run so live queries stay responsive during long commits.
    if (this.isCommittingSyncTransactions && !triggeredByUserAction) {
      return
    }

    const previousState = new Map(this.optimisticUpserts)
    const previousDeletes = new Set(this.optimisticDeletes)

    // Clear current optimistic state
    this.optimisticUpserts.clear()
    this.optimisticDeletes.clear()

    const activeTransactions: Array<Transaction<any>> = []

    for (const transaction of this.transactions.values()) {
      if (![`completed`, `failed`].includes(transaction.state)) {
        activeTransactions.push(transaction)
      }
    }

    // Apply active transactions only (completed transactions are handled by sync operations)
    for (const transaction of activeTransactions) {
      for (const mutation of transaction.mutations) {
        if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
          switch (mutation.type) {
            case `insert`:
            case `update`:
              this.optimisticUpserts.set(
                mutation.key,
                mutation.modified as TOutput,
              )
              this.optimisticDeletes.delete(mutation.key)
              break
            case `delete`:
              this.optimisticUpserts.delete(mutation.key)
              this.optimisticDeletes.add(mutation.key)
              break
          }
        }
      }
    }

    // Update cached size
    this.size = this.calculateSize()

    // Collect events for changes
    const events: Array<ChangeMessage<TOutput, TKey>> = []
    this.collectOptimisticChanges(previousState, previousDeletes, events)

    // Filter out events for recently synced keys to prevent duplicates
    // BUT: Only filter out events that are actually from sync operations
    // New user transactions should NOT be filtered even if the key was recently synced
    const filteredEventsBySyncStatus = events.filter((event) => {
      if (!this.recentlySyncedKeys.has(event.key)) {
        return true // Key not recently synced, allow event through
      }

      // Key was recently synced - allow if this is a user-triggered action
      if (triggeredByUserAction) {
        return true
      }

      // Otherwise filter out duplicate sync events
      return false
    })

    // Filter out redundant delete events if there are pending sync transactions
    // that will immediately restore the same data, but only for completed transactions
    // IMPORTANT: Skip complex filtering for user-triggered actions to prevent UI blocking
    if (this.pendingSyncedTransactions.length > 0 && !triggeredByUserAction) {
      const pendingSyncKeys = new Set<TKey>()

      // Collect keys from pending sync operations
      for (const transaction of this.pendingSyncedTransactions) {
        for (const operation of transaction.operations) {
          pendingSyncKeys.add(operation.key as TKey)
        }
      }

      // Only filter out delete events for keys that:
      // 1. Have pending sync operations AND
      // 2. Are from completed transactions (being cleaned up)
      const filteredEvents = filteredEventsBySyncStatus.filter((event) => {
        if (event.type === `delete` && pendingSyncKeys.has(event.key)) {
          // Check if this delete is from clearing optimistic state of completed transactions
          // We can infer this by checking if we have no remaining optimistic mutations for this key
          const hasActiveOptimisticMutation = activeTransactions.some((tx) =>
            tx.mutations.some(
              (m) => this.isThisCollection(m.collection) && m.key === event.key,
            ),
          )

          if (!hasActiveOptimisticMutation) {
            return false // Skip this delete event as sync will restore the data
          }
        }
        return true
      })

      // Update indexes for the filtered events
      if (filteredEvents.length > 0) {
        this.indexes.updateIndexes(filteredEvents)
      }
      this.changes.emitEvents(filteredEvents, triggeredByUserAction)
    } else {
      // Update indexes for all events
      if (filteredEventsBySyncStatus.length > 0) {
        this.indexes.updateIndexes(filteredEventsBySyncStatus)
      }
      // Emit all events if no pending sync transactions
      this.changes.emitEvents(filteredEventsBySyncStatus, triggeredByUserAction)
    }
  }

  /**
   * Calculate the current size based on synced data and optimistic changes
   */
  private calculateSize(): number {
    const syncedSize = this.syncedData.size
    const deletesFromSynced = Array.from(this.optimisticDeletes).filter(
      (key) => this.syncedData.has(key) && !this.optimisticUpserts.has(key),
    ).length
    const upsertsNotInSynced = Array.from(this.optimisticUpserts.keys()).filter(
      (key) => !this.syncedData.has(key),
    ).length

    return syncedSize - deletesFromSynced + upsertsNotInSynced
  }

  /**
   * Collect events for optimistic changes
   */
  private collectOptimisticChanges(
    previousUpserts: Map<TKey, TOutput>,
    previousDeletes: Set<TKey>,
    events: Array<ChangeMessage<TOutput, TKey>>,
  ): void {
    const allKeys = new Set([
      ...previousUpserts.keys(),
      ...this.optimisticUpserts.keys(),
      ...previousDeletes,
      ...this.optimisticDeletes,
    ])

    for (const key of allKeys) {
      const currentValue = this.get(key)
      const previousValue = this.getPreviousValue(
        key,
        previousUpserts,
        previousDeletes,
      )

      if (previousValue !== undefined && currentValue === undefined) {
        events.push({ type: `delete`, key, value: previousValue })
      } else if (previousValue === undefined && currentValue !== undefined) {
        events.push({ type: `insert`, key, value: currentValue })
      } else if (
        previousValue !== undefined &&
        currentValue !== undefined &&
        previousValue !== currentValue
      ) {
        events.push({
          type: `update`,
          key,
          value: currentValue,
          previousValue,
        })
      }
    }
  }

  /**
   * Get the previous value for a key given previous optimistic state
   */
  private getPreviousValue(
    key: TKey,
    previousUpserts: Map<TKey, TOutput>,
    previousDeletes: Set<TKey>,
  ): TOutput | undefined {
    if (previousDeletes.has(key)) {
      return undefined
    }
    if (previousUpserts.has(key)) {
      return previousUpserts.get(key)
    }
    return this.syncedData.get(key)
  }

  /**
   * Attempts to commit pending synced transactions if there are no active transactions
   * This method processes operations from pending transactions and applies them to the synced data
   */
  commitPendingTransactions = () => {
    // Check if there are any persisting transaction
    let hasPersistingTransaction = false
    for (const transaction of this.transactions.values()) {
      if (transaction.state === `persisting`) {
        hasPersistingTransaction = true
        break
      }
    }

    // pending synced transactions could be either `committed` or still open.
    // we only want to process `committed` transactions here
    const {
      committedSyncedTransactions,
      uncommittedSyncedTransactions,
      hasTruncateSync,
    } = this.pendingSyncedTransactions.reduce(
      (acc, t) => {
        if (t.committed) {
          acc.committedSyncedTransactions.push(t)
          if (t.truncate === true) {
            acc.hasTruncateSync = true
          }
        } else {
          acc.uncommittedSyncedTransactions.push(t)
        }
        return acc
      },
      {
        committedSyncedTransactions: [] as Array<
          PendingSyncedTransaction<TOutput, TKey>
        >,
        uncommittedSyncedTransactions: [] as Array<
          PendingSyncedTransaction<TOutput, TKey>
        >,
        hasTruncateSync: false,
      },
    )

    if (!hasPersistingTransaction || hasTruncateSync) {
      // Set flag to prevent redundant optimistic state recalculations
      this.isCommittingSyncTransactions = true

      // Get the optimistic snapshot from the truncate transaction (captured when truncate() was called)
      const truncateOptimisticSnapshot = hasTruncateSync
        ? committedSyncedTransactions.find((t) => t.truncate)
            ?.optimisticSnapshot
        : null

      // First collect all keys that will be affected by sync operations
      const changedKeys = new Set<TKey>()
      for (const transaction of committedSyncedTransactions) {
        for (const operation of transaction.operations) {
          changedKeys.add(operation.key as TKey)
        }
      }

      // Use pre-captured state if available (from optimistic scenarios),
      // otherwise capture current state (for pure sync scenarios)
      let currentVisibleState = this.preSyncVisibleState
      if (currentVisibleState.size === 0) {
        // No pre-captured state, capture it now for pure sync operations
        currentVisibleState = new Map<TKey, TOutput>()
        for (const key of changedKeys) {
          const currentValue = this.get(key)
          if (currentValue !== undefined) {
            currentVisibleState.set(key, currentValue)
          }
        }
      }

      const events: Array<ChangeMessage<TOutput, TKey>> = []
      const rowUpdateMode = this.config.sync.rowUpdateMode || `partial`

      for (const transaction of committedSyncedTransactions) {
        // Handle truncate operations first
        if (transaction.truncate) {
          // TRUNCATE PHASE
          // 1) Emit a delete for every visible key (synced + optimistic) so downstream listeners/indexes
          //    observe a clear-before-rebuild. We intentionally skip keys already in
          //    optimisticDeletes because their delete was previously emitted by the user.
          // Use the snapshot to ensure we emit deletes for all items that existed at truncate start.
          const visibleKeys = new Set([
            ...this.syncedData.keys(),
            ...(truncateOptimisticSnapshot?.upserts.keys() || []),
          ])
          for (const key of visibleKeys) {
            if (truncateOptimisticSnapshot?.deletes.has(key)) continue
            const previousValue =
              truncateOptimisticSnapshot?.upserts.get(key) ||
              this.syncedData.get(key)
            if (previousValue !== undefined) {
              events.push({ type: `delete`, key, value: previousValue })
            }
          }

          // 2) Clear the authoritative synced base. Subsequent server ops in this
          //    same commit will rebuild the base atomically.
          this.syncedData.clear()
          this.syncedMetadata.clear()
          this.syncedKeys.clear()

          // 3) Clear currentVisibleState for truncated keys to ensure subsequent operations
          //    are compared against the post-truncate state (undefined) rather than pre-truncate state
          //    This ensures that re-inserted keys are emitted as INSERT events, not UPDATE events
          for (const key of changedKeys) {
            currentVisibleState.delete(key)
          }

          // 4) Emit truncate event so subscriptions can reset their cursor tracking state
          this._events.emit(`truncate`, {
            type: `truncate`,
            collection: this.collection,
          })
        }

        for (const operation of transaction.operations) {
          const key = operation.key as TKey
          this.syncedKeys.add(key)

          // Update metadata
          switch (operation.type) {
            case `insert`:
              this.syncedMetadata.set(key, operation.metadata)
              break
            case `update`:
              this.syncedMetadata.set(
                key,
                Object.assign(
                  {},
                  this.syncedMetadata.get(key),
                  operation.metadata,
                ),
              )
              break
            case `delete`:
              this.syncedMetadata.delete(key)
              break
          }

          // Update synced data
          switch (operation.type) {
            case `insert`:
              this.syncedData.set(key, operation.value)
              break
            case `update`: {
              if (rowUpdateMode === `partial`) {
                const updatedValue = Object.assign(
                  {},
                  this.syncedData.get(key),
                  operation.value,
                )
                this.syncedData.set(key, updatedValue)
              } else {
                this.syncedData.set(key, operation.value)
              }
              break
            }
            case `delete`:
              this.syncedData.delete(key)
              break
          }
        }
      }

      // After applying synced operations, if this commit included a truncate,
      // re-apply optimistic mutations on top of the fresh synced base. This ensures
      // the UI preserves local intent while respecting server rebuild semantics.
      // Ordering: deletes (above) -> server ops (just applied) -> optimistic upserts.
      if (hasTruncateSync) {
        // Avoid duplicating keys that were inserted/updated by synced operations in this commit
        const syncedInsertedOrUpdatedKeys = new Set<TKey>()
        for (const t of committedSyncedTransactions) {
          for (const op of t.operations) {
            if (op.type === `insert` || op.type === `update`) {
              syncedInsertedOrUpdatedKeys.add(op.key as TKey)
            }
          }
        }

        // Build re-apply sets from the snapshot taken at the start of this function.
        // This prevents losing optimistic state if transactions complete during truncate processing.
        const reapplyUpserts = new Map<TKey, TOutput>(
          truncateOptimisticSnapshot!.upserts,
        )
        const reapplyDeletes = new Set<TKey>(
          truncateOptimisticSnapshot!.deletes,
        )

        // Emit inserts for re-applied upserts, skipping any keys that have an optimistic delete.
        // If the server also inserted/updated the same key in this batch, override that value
        // with the optimistic value to preserve local intent.
        for (const [key, value] of reapplyUpserts) {
          if (reapplyDeletes.has(key)) continue
          if (syncedInsertedOrUpdatedKeys.has(key)) {
            let foundInsert = false
            for (let i = events.length - 1; i >= 0; i--) {
              const evt = events[i]!
              if (evt.key === key && evt.type === `insert`) {
                evt.value = value
                foundInsert = true
                break
              }
            }
            if (!foundInsert) {
              events.push({ type: `insert`, key, value })
            }
          } else {
            events.push({ type: `insert`, key, value })
          }
        }

        // Finally, ensure we do NOT insert keys that have an outstanding optimistic delete.
        if (events.length > 0 && reapplyDeletes.size > 0) {
          const filtered: Array<ChangeMessage<TOutput, TKey>> = []
          for (const evt of events) {
            if (evt.type === `insert` && reapplyDeletes.has(evt.key)) {
              continue
            }
            filtered.push(evt)
          }
          events.length = 0
          events.push(...filtered)
        }

        // Ensure listeners are active before emitting this critical batch
        if (this.lifecycle.status !== `ready`) {
          this.lifecycle.markReady()
        }
      }

      // Maintain optimistic state appropriately
      // Clear optimistic state since sync operations will now provide the authoritative data.
      // Any still-active user transactions will be re-applied below in recompute.
      this.optimisticUpserts.clear()
      this.optimisticDeletes.clear()

      // Reset flag and recompute optimistic state for any remaining active transactions
      this.isCommittingSyncTransactions = false

      // If we had a truncate, restore the preserved optimistic state from the snapshot
      // This includes items from transactions that may have completed during processing
      if (hasTruncateSync && truncateOptimisticSnapshot) {
        for (const [key, value] of truncateOptimisticSnapshot.upserts) {
          this.optimisticUpserts.set(key, value)
        }
        for (const key of truncateOptimisticSnapshot.deletes) {
          this.optimisticDeletes.add(key)
        }
      }

      // Always overlay any still-active optimistic transactions so mutations that started
      // after the truncate snapshot are preserved.
      for (const transaction of this.transactions.values()) {
        if (![`completed`, `failed`].includes(transaction.state)) {
          for (const mutation of transaction.mutations) {
            if (
              this.isThisCollection(mutation.collection) &&
              mutation.optimistic
            ) {
              switch (mutation.type) {
                case `insert`:
                case `update`:
                  this.optimisticUpserts.set(
                    mutation.key,
                    mutation.modified as TOutput,
                  )
                  this.optimisticDeletes.delete(mutation.key)
                  break
                case `delete`:
                  this.optimisticUpserts.delete(mutation.key)
                  this.optimisticDeletes.add(mutation.key)
                  break
              }
            }
          }
        }
      }

      // Check for redundant sync operations that match completed optimistic operations
      const completedOptimisticOps = new Map<TKey, any>()

      for (const transaction of this.transactions.values()) {
        if (transaction.state === `completed`) {
          for (const mutation of transaction.mutations) {
            if (
              mutation.optimistic &&
              this.isThisCollection(mutation.collection) &&
              changedKeys.has(mutation.key)
            ) {
              completedOptimisticOps.set(mutation.key, {
                type: mutation.type,
                value: mutation.modified,
              })
            }
          }
        }
      }

      // Now check what actually changed in the final visible state
      for (const key of changedKeys) {
        const previousVisibleValue = currentVisibleState.get(key)
        const newVisibleValue = this.get(key) // This returns the new derived state

        // Check if this sync operation is redundant with a completed optimistic operation
        const completedOp = completedOptimisticOps.get(key)
        let isRedundantSync = false

        if (completedOp) {
          if (
            completedOp.type === `delete` &&
            previousVisibleValue !== undefined &&
            newVisibleValue === undefined &&
            deepEquals(completedOp.value, previousVisibleValue)
          ) {
            isRedundantSync = true
          } else if (
            newVisibleValue !== undefined &&
            deepEquals(completedOp.value, newVisibleValue)
          ) {
            isRedundantSync = true
          }
        }

        if (!isRedundantSync) {
          if (
            previousVisibleValue === undefined &&
            newVisibleValue !== undefined
          ) {
            events.push({
              type: `insert`,
              key,
              value: newVisibleValue,
            })
          } else if (
            previousVisibleValue !== undefined &&
            newVisibleValue === undefined
          ) {
            events.push({
              type: `delete`,
              key,
              value: previousVisibleValue,
            })
          } else if (
            previousVisibleValue !== undefined &&
            newVisibleValue !== undefined &&
            !deepEquals(previousVisibleValue, newVisibleValue)
          ) {
            events.push({
              type: `update`,
              key,
              value: newVisibleValue,
              previousValue: previousVisibleValue,
            })
          }
        }
      }

      // Update cached size after synced data changes
      this.size = this.calculateSize()

      // Update indexes for all events before emitting
      if (events.length > 0) {
        this.indexes.updateIndexes(events)
      }

      // End batching and emit all events (combines any batched events with sync events)
      this.changes.emitEvents(events, true)

      this.pendingSyncedTransactions = uncommittedSyncedTransactions

      // Clear the pre-sync state since sync operations are complete
      this.preSyncVisibleState.clear()

      // Clear recently synced keys after a microtask to allow recomputeOptimisticState to see them
      Promise.resolve().then(() => {
        this.recentlySyncedKeys.clear()
      })

      // Mark that we've received the first commit (for tracking purposes)
      if (!this.hasReceivedFirstCommit) {
        this.hasReceivedFirstCommit = true
      }
    }
  }

  /**
   * Schedule cleanup of a transaction when it completes
   */
  public scheduleTransactionCleanup(transaction: Transaction<any>): void {
    // Only schedule cleanup for transactions that aren't already completed
    if (transaction.state === `completed`) {
      this.transactions.delete(transaction.id)
      return
    }

    // Schedule cleanup when the transaction completes
    transaction.isPersisted.promise
      .then(() => {
        // Transaction completed successfully, remove it immediately
        this.transactions.delete(transaction.id)
      })
      .catch(() => {
        // Transaction failed, but we want to keep failed transactions for reference
        // so don't remove it.
        // This empty catch block is necessary to prevent unhandled promise rejections.
      })
  }

  /**
   * Capture visible state for keys that will be affected by pending sync operations
   * This must be called BEFORE onTransactionStateChange clears optimistic state
   */
  public capturePreSyncVisibleState(): void {
    if (this.pendingSyncedTransactions.length === 0) return

    // Get all keys that will be affected by sync operations
    const syncedKeys = new Set<TKey>()
    for (const transaction of this.pendingSyncedTransactions) {
      for (const operation of transaction.operations) {
        syncedKeys.add(operation.key as TKey)
      }
    }

    // Mark keys as about to be synced to suppress intermediate events from recomputeOptimisticState
    for (const key of syncedKeys) {
      this.recentlySyncedKeys.add(key)
    }

    // Only capture current visible state for keys that will be affected by sync operations
    // This is much more efficient than capturing the entire collection state
    // Only capture keys that haven't been captured yet to preserve earlier captures
    for (const key of syncedKeys) {
      if (!this.preSyncVisibleState.has(key)) {
        const currentValue = this.get(key)
        if (currentValue !== undefined) {
          this.preSyncVisibleState.set(key, currentValue)
        }
      }
    }
  }

  /**
   * Trigger a recomputation when transactions change
   * This method should be called by the Transaction class when state changes
   */
  public onTransactionStateChange(): void {
    // Check if commitPendingTransactions will be called after this
    // by checking if there are pending sync transactions (same logic as in transactions.ts)
    this.changes.shouldBatchEvents = this.pendingSyncedTransactions.length > 0

    // CRITICAL: Capture visible state BEFORE clearing optimistic state
    this.capturePreSyncVisibleState()

    this.recomputeOptimisticState(false)
  }

  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  public cleanup(): void {
    this.syncedData.clear()
    this.syncedMetadata.clear()
    this.optimisticUpserts.clear()
    this.optimisticDeletes.clear()
    this.size = 0
    this.pendingSyncedTransactions = []
    this.syncedKeys.clear()
    this.hasReceivedFirstCommit = false
  }
}
