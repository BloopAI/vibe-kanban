import { ensureIndexForExpression } from '../indexes/auto-index.js'
import { and, eq, gte, lt } from '../query/builder/functions.js'
import { PropRef, Value } from '../query/ir.js'
import { EventEmitter } from '../event-emitter.js'
import { compileExpression } from '../query/compiler/evaluators.js'
import { buildCursor } from '../utils/cursor.js'
import {
  createFilterFunctionFromExpression,
  createFilteredCallback,
} from './change-events.js'
import type { BasicExpression, OrderBy } from '../query/ir.js'
import type { IndexInterface } from '../indexes/base-index.js'
import type {
  ChangeMessage,
  LoadSubsetOptions,
  Subscription,
  SubscriptionEvents,
  SubscriptionStatus,
  SubscriptionUnsubscribedEvent,
} from '../types.js'
import type { CollectionImpl } from './index.js'

type RequestSnapshotOptions = {
  where?: BasicExpression<boolean>
  optimizedOnly?: boolean
  trackLoadSubsetPromise?: boolean
  /** Optional orderBy to pass to loadSubset for backend optimization */
  orderBy?: OrderBy
  /** Optional limit to pass to loadSubset for backend optimization */
  limit?: number
}

type RequestLimitedSnapshotOptions = {
  orderBy: OrderBy
  limit: number
  /** All column values for cursor (first value used for local index, all values for sync layer) */
  minValues?: Array<unknown>
  /** Row offset for offset-based pagination (passed to sync layer) */
  offset?: number
}

type CollectionSubscriptionOptions = {
  includeInitialState?: boolean
  /** Pre-compiled expression for filtering changes */
  whereExpression?: BasicExpression<boolean>
  /** Callback to call when the subscription is unsubscribed */
  onUnsubscribe?: (event: SubscriptionUnsubscribedEvent) => void
}

export class CollectionSubscription
  extends EventEmitter<SubscriptionEvents>
  implements Subscription
{
  private loadedInitialState = false

  // Flag to skip filtering in filterAndFlipChanges.
  // This is separate from loadedInitialState because we want to allow
  // requestSnapshot to still work even when filtering is skipped.
  private skipFiltering = false

  // Flag to indicate that we have sent at least 1 snapshot.
  // While `snapshotSent` is false we filter out all changes from subscription to the collection.
  private snapshotSent = false

  /**
   * Track all loadSubset calls made by this subscription so we can unload them on cleanup.
   * We store the exact LoadSubsetOptions we passed to loadSubset to ensure symmetric unload.
   */
  private loadedSubsets: Array<LoadSubsetOptions> = []

  // Keep track of the keys we've sent (needed for join and orderBy optimizations)
  private sentKeys = new Set<string | number>()

  // Track the count of rows sent via requestLimitedSnapshot for offset-based pagination
  private limitedSnapshotRowCount = 0

  // Track the last key sent via requestLimitedSnapshot for cursor-based pagination
  private lastSentKey: string | number | undefined

  private filteredCallback: (changes: Array<ChangeMessage<any, any>>) => void

  private orderByIndex: IndexInterface<string | number> | undefined

  // Status tracking
  private _status: SubscriptionStatus = `ready`
  private pendingLoadSubsetPromises: Set<Promise<void>> = new Set()

  // Cleanup function for truncate event listener
  private truncateCleanup: (() => void) | undefined

  // Truncate buffering state
  // When a truncate occurs, we buffer changes until all loadSubset refetches complete
  // This prevents a flash of missing content between deletes and new inserts
  private isBufferingForTruncate = false
  private truncateBuffer: Array<Array<ChangeMessage<any, any>>> = []
  private pendingTruncateRefetches: Set<Promise<void>> = new Set()

  public get status(): SubscriptionStatus {
    return this._status
  }

  constructor(
    private collection: CollectionImpl<any, any, any, any, any>,
    private callback: (changes: Array<ChangeMessage<any, any>>) => void,
    private options: CollectionSubscriptionOptions,
  ) {
    super()
    if (options.onUnsubscribe) {
      this.on(`unsubscribed`, (event) => options.onUnsubscribe!(event))
    }

    // Auto-index for where expressions if enabled
    if (options.whereExpression) {
      ensureIndexForExpression(options.whereExpression, this.collection)
    }

    const callbackWithSentKeysTracking = (
      changes: Array<ChangeMessage<any, any>>,
    ) => {
      callback(changes)
      this.trackSentKeys(changes)
    }

    this.callback = callbackWithSentKeysTracking

    // Create a filtered callback if where clause is provided
    this.filteredCallback = options.whereExpression
      ? createFilteredCallback(this.callback, options)
      : this.callback

    // Listen for truncate events to re-request data after must-refetch
    // When a truncate happens (e.g., from a 409 must-refetch), all collection data is cleared.
    // We need to re-request all previously loaded subsets to repopulate the data.
    this.truncateCleanup = this.collection.on(`truncate`, () => {
      this.handleTruncate()
    })
  }

  /**
   * Handle collection truncate event by resetting state and re-requesting subsets.
   * This is called when the sync layer receives a must-refetch and clears all data.
   *
   * To prevent a flash of missing content, we buffer all changes (deletes from truncate
   * and inserts from refetch) until all loadSubset promises resolve, then emit them together.
   */
  private handleTruncate() {
    // Copy the loaded subsets before clearing (we'll re-request them)
    const subsetsToReload = [...this.loadedSubsets]

    // Only buffer if there's an actual loadSubset handler that can do async work.
    // Without a loadSubset handler, there's nothing to re-request and no reason to buffer.
    // This prevents unnecessary buffering in eager sync mode or when loadSubset isn't implemented.
    const hasLoadSubsetHandler = this.collection._sync.syncLoadSubsetFn !== null

    // If there are no subsets to reload OR no loadSubset handler, just reset state
    if (subsetsToReload.length === 0 || !hasLoadSubsetHandler) {
      this.snapshotSent = false
      this.loadedInitialState = false
      this.limitedSnapshotRowCount = 0
      this.lastSentKey = undefined
      this.loadedSubsets = []
      return
    }

    // Start buffering BEFORE we receive the delete events from the truncate commit
    // This ensures we capture both the deletes and subsequent inserts
    this.isBufferingForTruncate = true
    this.truncateBuffer = []
    this.pendingTruncateRefetches.clear()

    // Reset snapshot/pagination tracking state
    // Note: We don't need to populate sentKeys here because filterAndFlipChanges
    // will skip the delete filter when isBufferingForTruncate is true
    this.snapshotSent = false
    this.loadedInitialState = false
    this.limitedSnapshotRowCount = 0
    this.lastSentKey = undefined

    // Clear the loadedSubsets array since we're re-requesting fresh
    this.loadedSubsets = []

    // Defer the loadSubset calls to a microtask so the truncate commit's delete events
    // are buffered BEFORE the loadSubset calls potentially trigger nested commits.
    // This ensures correct event ordering: deletes first, then inserts.
    queueMicrotask(() => {
      // Check if we were unsubscribed while waiting
      if (!this.isBufferingForTruncate) {
        return
      }

      // Re-request all previously loaded subsets and track their promises
      for (const options of subsetsToReload) {
        const syncResult = this.collection._sync.loadSubset(options)

        // Track this loadSubset call so we can unload it later
        this.loadedSubsets.push(options)
        this.trackLoadSubsetPromise(syncResult)

        // Track the promise for buffer flushing
        if (syncResult instanceof Promise) {
          this.pendingTruncateRefetches.add(syncResult)
          syncResult
            .catch(() => {
              // Ignore errors - we still want to flush the buffer even if some requests fail
            })
            .finally(() => {
              this.pendingTruncateRefetches.delete(syncResult)
              this.checkTruncateRefetchComplete()
            })
        }
      }

      // If all loadSubset calls were synchronous (returned true), flush now
      // At this point, delete events have already been buffered from the truncate commit
      if (this.pendingTruncateRefetches.size === 0) {
        this.flushTruncateBuffer()
      }
    })
  }

  /**
   * Check if all truncate refetch promises have completed and flush buffer if so
   */
  private checkTruncateRefetchComplete() {
    if (
      this.pendingTruncateRefetches.size === 0 &&
      this.isBufferingForTruncate
    ) {
      this.flushTruncateBuffer()
    }
  }

  /**
   * Flush the truncate buffer, emitting all buffered changes to the callback
   */
  private flushTruncateBuffer() {
    this.isBufferingForTruncate = false

    // Flatten all buffered changes into a single array for atomic emission
    // This ensures consumers see all truncate changes (deletes + inserts) in one callback
    const merged = this.truncateBuffer.flat()
    if (merged.length > 0) {
      this.filteredCallback(merged)
    }

    this.truncateBuffer = []
  }

  setOrderByIndex(index: IndexInterface<any>) {
    this.orderByIndex = index
  }

  /**
   * Set subscription status and emit events if changed
   */
  private setStatus(newStatus: SubscriptionStatus) {
    if (this._status === newStatus) {
      return // No change
    }

    const previousStatus = this._status
    this._status = newStatus

    // Emit status:change event
    this.emitInner(`status:change`, {
      type: `status:change`,
      subscription: this,
      previousStatus,
      status: newStatus,
    })

    // Emit specific status event
    const eventKey: `status:${SubscriptionStatus}` = `status:${newStatus}`
    this.emitInner(eventKey, {
      type: eventKey,
      subscription: this,
      previousStatus,
      status: newStatus,
    } as SubscriptionEvents[typeof eventKey])
  }

  /**
   * Track a loadSubset promise and manage loading status
   */
  private trackLoadSubsetPromise(syncResult: Promise<void> | true) {
    // Track the promise if it's actually a promise (async work)
    if (syncResult instanceof Promise) {
      this.pendingLoadSubsetPromises.add(syncResult)
      this.setStatus(`loadingSubset`)

      syncResult.finally(() => {
        this.pendingLoadSubsetPromises.delete(syncResult)
        if (this.pendingLoadSubsetPromises.size === 0) {
          this.setStatus(`ready`)
        }
      })
    }
  }

  hasLoadedInitialState() {
    return this.loadedInitialState
  }

  hasSentAtLeastOneSnapshot() {
    return this.snapshotSent
  }

  emitEvents(changes: Array<ChangeMessage<any, any>>) {
    const newChanges = this.filterAndFlipChanges(changes)

    if (this.isBufferingForTruncate) {
      // Buffer the changes instead of emitting immediately
      // This prevents a flash of missing content during truncate/refetch
      if (newChanges.length > 0) {
        this.truncateBuffer.push(newChanges)
      }
    } else {
      this.filteredCallback(newChanges)
    }
  }

  /**
   * Sends the snapshot to the callback.
   * Returns a boolean indicating if it succeeded.
   * It can only fail if there is no index to fulfill the request
   * and the optimizedOnly option is set to true,
   * or, the entire state was already loaded.
   */
  requestSnapshot(opts?: RequestSnapshotOptions): boolean {
    if (this.loadedInitialState) {
      // Subscription was deoptimized so we already sent the entire initial state
      return false
    }

    const stateOpts: RequestSnapshotOptions = {
      where: this.options.whereExpression,
      optimizedOnly: opts?.optimizedOnly ?? false,
    }

    if (opts) {
      if (`where` in opts) {
        const snapshotWhereExp = opts.where
        if (stateOpts.where) {
          // Combine the two where expressions
          const subWhereExp = stateOpts.where
          const combinedWhereExp = and(subWhereExp, snapshotWhereExp)
          stateOpts.where = combinedWhereExp
        } else {
          stateOpts.where = snapshotWhereExp
        }
      }
    } else {
      // No options provided so it's loading the entire initial state
      this.loadedInitialState = true
    }

    // Request the sync layer to load more data
    // don't await it, we will load the data into the collection when it comes in
    const loadOptions: LoadSubsetOptions = {
      where: stateOpts.where,
      subscription: this,
      // Include orderBy and limit if provided so sync layer can optimize the query
      orderBy: opts?.orderBy,
      limit: opts?.limit,
    }
    const syncResult = this.collection._sync.loadSubset(loadOptions)

    // Track this loadSubset call so we can unload it later
    this.loadedSubsets.push(loadOptions)

    const trackLoadSubsetPromise = opts?.trackLoadSubsetPromise ?? true
    if (trackLoadSubsetPromise) {
      this.trackLoadSubsetPromise(syncResult)
    }

    // Also load data immediately from the collection
    const snapshot = this.collection.currentStateAsChanges(stateOpts)

    if (snapshot === undefined) {
      // Couldn't load from indexes
      return false
    }

    // Only send changes that have not been sent yet
    const filteredSnapshot = snapshot.filter(
      (change) => !this.sentKeys.has(change.key),
    )

    // Add keys to sentKeys BEFORE calling callback to prevent race condition.
    // If a change event arrives while the callback is executing, it will see
    // the keys already in sentKeys and filter out duplicates correctly.
    for (const change of filteredSnapshot) {
      this.sentKeys.add(change.key)
    }

    this.snapshotSent = true
    this.callback(filteredSnapshot)
    return true
  }

  /**
   * Sends a snapshot that fulfills the `where` clause and all rows are bigger or equal to the cursor.
   * Requires a range index to be set with `setOrderByIndex` prior to calling this method.
   * It uses that range index to load the items in the order of the index.
   *
   * For multi-column orderBy:
   * - Uses first value from `minValues` for LOCAL index operations (wide bounds, ensures no missed rows)
   * - Uses all `minValues` to build a precise composite cursor for SYNC layer loadSubset
   *
   * Note 1: it may load more rows than the provided LIMIT because it loads all values equal to the first cursor value + limit values greater.
   *         This is needed to ensure that it does not accidentally skip duplicate values when the limit falls in the middle of some duplicated values.
   * Note 2: it does not send keys that have already been sent before.
   */
  requestLimitedSnapshot({
    orderBy,
    limit,
    minValues,
    offset,
  }: RequestLimitedSnapshotOptions) {
    if (!limit) throw new Error(`limit is required`)

    if (!this.orderByIndex) {
      throw new Error(
        `Ordered snapshot was requested but no index was found. You have to call setOrderByIndex before requesting an ordered snapshot.`,
      )
    }

    // Derive first column value from minValues (used for local index operations)
    const minValue = minValues?.[0]
    // Cast for index operations (index expects string | number)
    const minValueForIndex = minValue as string | number | undefined

    const index = this.orderByIndex
    const where = this.options.whereExpression
    const whereFilterFn = where
      ? createFilterFunctionFromExpression(where)
      : undefined

    const filterFn = (key: string | number): boolean => {
      if (this.sentKeys.has(key)) {
        return false
      }

      const value = this.collection.get(key)
      if (value === undefined) {
        return false
      }

      return whereFilterFn?.(value) ?? true
    }

    let biggestObservedValue = minValueForIndex
    const changes: Array<ChangeMessage<any, string | number>> = []

    // If we have a minValue we need to handle the case
    // where there might be duplicate values equal to minValue that we need to include
    // because we can have data like this: [1, 2, 3, 3, 3, 4, 5]
    // so if minValue is 3 then the previous snapshot may not have included all 3s
    // e.g. if it was offset 0 and limit 3 it would only have loaded the first 3
    //      so we load all rows equal to minValue first, to be sure we don't skip any duplicate values
    //
    // For multi-column orderBy, we use the first column value for index operations (wide bounds)
    // This may load some duplicates but ensures we never miss any rows.
    let keys: Array<string | number> = []
    if (minValueForIndex !== undefined) {
      // First, get all items with the same FIRST COLUMN value as minValue
      // This provides wide bounds for the local index
      const { expression } = orderBy[0]!
      const allRowsWithMinValue = this.collection.currentStateAsChanges({
        where: eq(expression, new Value(minValueForIndex)),
      })

      if (allRowsWithMinValue) {
        const keysWithMinValue = allRowsWithMinValue
          .map((change) => change.key)
          .filter((key) => !this.sentKeys.has(key) && filterFn(key))

        // Add items with the minValue first
        keys.push(...keysWithMinValue)

        // Then get items greater than minValue
        const keysGreaterThanMin = index.take(
          limit - keys.length,
          minValueForIndex,
          filterFn,
        )
        keys.push(...keysGreaterThanMin)
      } else {
        keys = index.take(limit, minValueForIndex, filterFn)
      }
    } else {
      keys = index.take(limit, minValueForIndex, filterFn)
    }

    const valuesNeeded = () => Math.max(limit - changes.length, 0)
    const collectionExhausted = () => keys.length === 0

    // Create a value extractor for the orderBy field to properly track the biggest indexed value
    const orderByExpression = orderBy[0]!.expression
    const valueExtractor =
      orderByExpression.type === `ref`
        ? compileExpression(new PropRef(orderByExpression.path), true)
        : null

    while (valuesNeeded() > 0 && !collectionExhausted()) {
      const insertedKeys = new Set<string | number>() // Track keys we add to `changes` in this iteration

      for (const key of keys) {
        const value = this.collection.get(key)!
        changes.push({
          type: `insert`,
          key,
          value,
        })
        // Extract the indexed value (e.g., salary) from the row, not the full row
        // This is needed for index.take() to work correctly with the BTree comparator
        biggestObservedValue = valueExtractor ? valueExtractor(value) : value
        insertedKeys.add(key) // Track this key
      }

      keys = index.take(valuesNeeded(), biggestObservedValue, filterFn)
    }

    // Track row count for offset-based pagination (before sending to callback)
    // Use the current count as the offset for this load
    const currentOffset = this.limitedSnapshotRowCount

    // Add keys to sentKeys BEFORE calling callback to prevent race condition.
    // If a change event arrives while the callback is executing, it will see
    // the keys already in sentKeys and filter out duplicates correctly.
    for (const change of changes) {
      this.sentKeys.add(change.key)
    }

    this.callback(changes)

    // Update the row count and last key after sending (for next call's offset/cursor)
    this.limitedSnapshotRowCount += changes.length
    if (changes.length > 0) {
      this.lastSentKey = changes[changes.length - 1]!.key
    }

    // Build cursor expressions for sync layer loadSubset
    // The cursor expressions are separate from the main where clause
    // so the sync layer can choose cursor-based or offset-based pagination
    let cursorExpressions:
      | {
          whereFrom: BasicExpression<boolean>
          whereCurrent: BasicExpression<boolean>
          lastKey?: string | number
        }
      | undefined

    if (minValues !== undefined && minValues.length > 0) {
      const whereFromCursor = buildCursor(orderBy, minValues)

      if (whereFromCursor) {
        const { expression } = orderBy[0]!
        const minValue = minValues[0]

        // Build the whereCurrent expression for the first orderBy column
        // For Date values, we need to handle precision differences between JS (ms) and backends (μs)
        // A JS Date represents a 1ms range, so we query for all values within that range
        let whereCurrentCursor: BasicExpression<boolean>
        if (minValue instanceof Date) {
          const minValuePlus1ms = new Date(minValue.getTime() + 1)
          whereCurrentCursor = and(
            gte(expression, new Value(minValue)),
            lt(expression, new Value(minValuePlus1ms)),
          )
        } else {
          whereCurrentCursor = eq(expression, new Value(minValue))
        }

        cursorExpressions = {
          whereFrom: whereFromCursor,
          whereCurrent: whereCurrentCursor,
          lastKey: this.lastSentKey,
        }
      }
    }

    // Request the sync layer to load more data
    // don't await it, we will load the data into the collection when it comes in
    // Note: `where` does NOT include cursor expressions - they are passed separately
    // The sync layer can choose to use cursor-based or offset-based pagination
    const loadOptions: LoadSubsetOptions = {
      where, // Main filter only, no cursor
      limit,
      orderBy,
      cursor: cursorExpressions, // Cursor expressions passed separately
      offset: offset ?? currentOffset, // Use provided offset, or auto-tracked offset
      subscription: this,
    }
    const syncResult = this.collection._sync.loadSubset(loadOptions)

    // Track this loadSubset call
    this.loadedSubsets.push(loadOptions)
    this.trackLoadSubsetPromise(syncResult)
  }

  // TODO: also add similar test but that checks that it can also load it from the collection's loadSubset function
  //       and that that also works properly (i.e. does not skip duplicate values)

  /**
   * Filters and flips changes for keys that have not been sent yet.
   * Deletes are filtered out for keys that have not been sent yet.
   * Updates are flipped into inserts for keys that have not been sent yet.
   * Duplicate inserts are filtered out to prevent D2 multiplicity > 1.
   */
  private filterAndFlipChanges(changes: Array<ChangeMessage<any, any>>) {
    if (this.loadedInitialState || this.skipFiltering) {
      // We loaded the entire initial state or filtering is explicitly skipped
      // so no need to filter or flip changes
      return changes
    }

    // When buffering for truncate, we need all changes (including deletes) to pass through.
    // This is important because:
    // 1. If loadedInitialState was previously true, sentKeys will be empty
    //    (trackSentKeys early-returns when loadedInitialState is true)
    // 2. The truncate deletes are for keys that WERE sent to the subscriber
    // 3. We're collecting all changes atomically, so filtering doesn't make sense
    const skipDeleteFilter = this.isBufferingForTruncate

    const newChanges = []
    for (const change of changes) {
      let newChange = change
      const keyInSentKeys = this.sentKeys.has(change.key)

      if (!keyInSentKeys) {
        if (change.type === `update`) {
          newChange = { ...change, type: `insert`, previousValue: undefined }
        } else if (change.type === `delete`) {
          // Filter out deletes for keys that have not been sent,
          // UNLESS we're buffering for truncate (where all deletes should pass through)
          if (!skipDeleteFilter) {
            continue
          }
        }
        this.sentKeys.add(change.key)
      } else {
        // Key was already sent - handle based on change type
        if (change.type === `insert`) {
          // Filter out duplicate inserts - the key was already inserted.
          // This prevents D2 multiplicity from going above 1, which would
          // cause deletes to not properly remove items (multiplicity would
          // go from 2 to 1 instead of 1 to 0).
          continue
        } else if (change.type === `delete`) {
          // Remove from sentKeys so future inserts for this key are allowed
          // (e.g., after truncate + reinsert)
          this.sentKeys.delete(change.key)
        }
      }
      newChanges.push(newChange)
    }
    return newChanges
  }

  private trackSentKeys(changes: Array<ChangeMessage<any, string | number>>) {
    if (this.loadedInitialState || this.skipFiltering) {
      // No need to track sent keys if we loaded the entire state or filtering is skipped.
      // Since filtering won't be applied, all keys are effectively "observed".
      return
    }

    for (const change of changes) {
      if (change.type === `delete`) {
        // Remove deleted keys from sentKeys so future re-inserts are allowed
        this.sentKeys.delete(change.key)
      } else {
        // For inserts and updates, track the key as sent
        this.sentKeys.add(change.key)
      }
    }
  }

  /**
   * Mark that the subscription should not filter any changes.
   * This is used when includeInitialState is explicitly set to false,
   * meaning the caller doesn't want initial state but does want ALL future changes.
   */
  markAllStateAsSeen() {
    this.skipFiltering = true
  }

  unsubscribe() {
    // Clean up truncate event listener
    this.truncateCleanup?.()
    this.truncateCleanup = undefined

    // Clean up truncate buffer state
    this.isBufferingForTruncate = false
    this.truncateBuffer = []
    this.pendingTruncateRefetches.clear()

    // Unload all subsets that this subscription loaded
    // We pass the exact same LoadSubsetOptions we used for loadSubset
    for (const options of this.loadedSubsets) {
      this.collection._sync.unloadSubset(options)
    }
    this.loadedSubsets = []

    this.emitInner(`unsubscribed`, {
      type: `unsubscribed`,
      subscription: this,
    })
    // Clear all event listeners to prevent memory leaks
    this.clearListeners()
  }
}
