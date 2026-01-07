import { MultiSet } from '@tanstack/db-ivm'
import {
  normalizeExpressionPaths,
  normalizeOrderByPaths,
} from '../compiler/expressions.js'
import type { MultiSetArray, RootStreamBuilder } from '@tanstack/db-ivm'
import type { Collection } from '../../collection/index.js'
import type { ChangeMessage } from '../../types.js'
import type { Context, GetResult } from '../builder/types.js'
import type { BasicExpression } from '../ir.js'
import type { OrderByOptimizationInfo } from '../compiler/order-by.js'
import type { CollectionConfigBuilder } from './collection-config-builder.js'
import type { CollectionSubscription } from '../../collection/subscription.js'

const loadMoreCallbackSymbol = Symbol.for(
  `@tanstack/db.collection-config-builder`,
)

export class CollectionSubscriber<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
> {
  // Keep track of the biggest value we've sent so far (needed for orderBy optimization)
  private biggest: any = undefined

  // Track deferred promises for subscription loading states
  private subscriptionLoadingPromises = new Map<
    CollectionSubscription,
    { resolve: () => void }
  >()

  // Track keys that have been sent to the D2 pipeline to prevent duplicate inserts
  // This is necessary because different code paths (initial load, change events)
  // can potentially send the same item to D2 multiple times.
  private sentToD2Keys = new Set<string | number>()

  constructor(
    private alias: string,
    private collectionId: string,
    private collection: Collection,
    private collectionConfigBuilder: CollectionConfigBuilder<TContext, TResult>,
  ) {}

  subscribe(): CollectionSubscription {
    const whereClause = this.getWhereClauseForAlias()

    if (whereClause) {
      const whereExpression = normalizeExpressionPaths(whereClause, this.alias)
      return this.subscribeToChanges(whereExpression)
    }

    return this.subscribeToChanges()
  }

  private subscribeToChanges(whereExpression?: BasicExpression<boolean>) {
    let subscription: CollectionSubscription
    const orderByInfo = this.getOrderByInfo()
    if (orderByInfo) {
      subscription = this.subscribeToOrderedChanges(
        whereExpression,
        orderByInfo,
      )
    } else {
      // If the source alias is lazy then we should not include the initial state
      const includeInitialState = !this.collectionConfigBuilder.isLazyAlias(
        this.alias,
      )

      subscription = this.subscribeToMatchingChanges(
        whereExpression,
        includeInitialState,
      )
    }

    const trackLoadPromise = () => {
      // Guard against duplicate transitions
      if (!this.subscriptionLoadingPromises.has(subscription)) {
        let resolve: () => void
        const promise = new Promise<void>((res) => {
          resolve = res
        })

        this.subscriptionLoadingPromises.set(subscription, {
          resolve: resolve!,
        })
        this.collectionConfigBuilder.liveQueryCollection!._sync.trackLoadPromise(
          promise,
        )
      }
    }

    // It can be that we are not yet subscribed when the first `loadSubset` call happens (i.e. the initial query).
    // So we also check the status here and if it's `loadingSubset` then we track the load promise
    if (subscription.status === `loadingSubset`) {
      trackLoadPromise()
    }

    // Subscribe to subscription status changes to propagate loading state
    const statusUnsubscribe = subscription.on(`status:change`, (event) => {
      if (event.status === `loadingSubset`) {
        trackLoadPromise()
      } else {
        // status is 'ready'
        const deferred = this.subscriptionLoadingPromises.get(subscription)
        if (deferred) {
          // Clear the map entry FIRST (before resolving)
          this.subscriptionLoadingPromises.delete(subscription)
          deferred.resolve()
        }
      }
    })

    const unsubscribe = () => {
      // If subscription has a pending promise, resolve it before unsubscribing
      const deferred = this.subscriptionLoadingPromises.get(subscription)
      if (deferred) {
        // Clear the map entry FIRST (before resolving)
        this.subscriptionLoadingPromises.delete(subscription)
        deferred.resolve()
      }

      statusUnsubscribe()
      subscription.unsubscribe()
    }
    // currentSyncState is always defined when subscribe() is called
    // (called during sync session setup)
    this.collectionConfigBuilder.currentSyncState!.unsubscribeCallbacks.add(
      unsubscribe,
    )
    return subscription
  }

  private sendChangesToPipeline(
    changes: Iterable<ChangeMessage<any, string | number>>,
    callback?: () => boolean,
  ) {
    // Filter changes to prevent duplicate inserts to D2 pipeline.
    // This ensures D2 multiplicity stays at 1 for visible items, so deletes
    // properly reduce multiplicity to 0 (triggering DELETE output).
    const changesArray = Array.isArray(changes) ? changes : [...changes]
    const filteredChanges: Array<ChangeMessage<any, string | number>> = []
    for (const change of changesArray) {
      if (change.type === `insert`) {
        if (this.sentToD2Keys.has(change.key)) {
          // Skip duplicate insert - already sent to D2
          continue
        }
        this.sentToD2Keys.add(change.key)
      } else if (change.type === `delete`) {
        // Remove from tracking so future re-inserts are allowed
        this.sentToD2Keys.delete(change.key)
      }
      // Updates are handled as delete+insert by splitUpdates, so no special handling needed
      filteredChanges.push(change)
    }

    // currentSyncState and input are always defined when this method is called
    // (only called from active subscriptions during a sync session)
    const input =
      this.collectionConfigBuilder.currentSyncState!.inputs[this.alias]!
    const sentChanges = sendChangesToInput(
      input,
      filteredChanges,
      this.collection.config.getKey,
    )

    // Do not provide the callback that loads more data
    // if there's no more data to load
    // otherwise we end up in an infinite loop trying to load more data
    const dataLoader = sentChanges > 0 ? callback : undefined

    // We need to schedule a graph run even if there's no data to load
    // because we need to mark the collection as ready if it's not already
    // and that's only done in `scheduleGraphRun`
    this.collectionConfigBuilder.scheduleGraphRun(dataLoader, {
      alias: this.alias,
    })
  }

  private subscribeToMatchingChanges(
    whereExpression: BasicExpression<boolean> | undefined,
    includeInitialState: boolean = false,
  ) {
    const sendChanges = (
      changes: Array<ChangeMessage<any, string | number>>,
    ) => {
      this.sendChangesToPipeline(changes)
    }

    // Only pass includeInitialState when true. When it's false, we leave it
    // undefined so that user subscriptions with explicit `includeInitialState: false`
    // can be distinguished from internal lazy-loading subscriptions.
    // If we pass `false`, changes.ts would call markAllStateAsSeen() which
    // disables filtering - but internal subscriptions still need filtering.
    const subscription = this.collection.subscribeChanges(sendChanges, {
      ...(includeInitialState && { includeInitialState }),
      whereExpression,
    })

    return subscription
  }

  private subscribeToOrderedChanges(
    whereExpression: BasicExpression<boolean> | undefined,
    orderByInfo: OrderByOptimizationInfo,
  ) {
    const { orderBy, offset, limit, index } = orderByInfo

    const sendChangesInRange = (
      changes: Iterable<ChangeMessage<any, string | number>>,
    ) => {
      // Split live updates into a delete of the old value and an insert of the new value
      const splittedChanges = splitUpdates(changes)
      this.sendChangesToPipelineWithTracking(splittedChanges, subscription)
    }

    // Subscribe to changes and only send changes that are smaller than the biggest value we've sent so far
    // values that are bigger don't need to be sent because they can't affect the topK
    const subscription = this.collection.subscribeChanges(sendChangesInRange, {
      whereExpression,
    })

    // Listen for truncate events to reset cursor tracking state and sentToD2Keys
    // This ensures that after a must-refetch/truncate, we don't use stale cursor data
    // and allow re-inserts of previously sent keys
    const truncateUnsubscribe = this.collection.on(`truncate`, () => {
      this.biggest = undefined
      this.sentToD2Keys.clear()
    })

    // Clean up truncate listener when subscription is unsubscribed
    subscription.on(`unsubscribed`, () => {
      truncateUnsubscribe()
    })

    // Normalize the orderBy clauses such that the references are relative to the collection
    const normalizedOrderBy = normalizeOrderByPaths(orderBy, this.alias)

    if (index) {
      // We have an index on the first orderBy column - use lazy loading optimization
      // This works for both single-column and multi-column orderBy:
      // - Single-column: index provides exact ordering
      // - Multi-column: index provides ordering on first column, secondary sort in memory
      subscription.setOrderByIndex(index)

      // Load the first `offset + limit` values from the index
      // i.e. the K items from the collection that fall into the requested range: [offset, offset + limit[
      subscription.requestLimitedSnapshot({
        limit: offset + limit,
        orderBy: normalizedOrderBy,
      })
    } else {
      // No index available (e.g., non-ref expression): pass orderBy/limit to loadSubset
      // so the sync layer can optimize if the backend supports it
      subscription.requestSnapshot({
        orderBy: normalizedOrderBy,
        limit: offset + limit,
      })
    }

    return subscription
  }

  // This function is called by maybeRunGraph
  // after each iteration of the query pipeline
  // to ensure that the orderBy operator has enough data to work with
  loadMoreIfNeeded(subscription: CollectionSubscription) {
    const orderByInfo = this.getOrderByInfo()

    if (!orderByInfo) {
      // This query has no orderBy operator
      // so there's no data to load
      return true
    }

    const { dataNeeded } = orderByInfo

    if (!dataNeeded) {
      // dataNeeded is not set when there's no index (e.g., non-ref expression).
      // In this case, we've already loaded all data via requestSnapshot
      // and don't need to lazily load more.
      return true
    }

    // `dataNeeded` probes the orderBy operator to see if it needs more data
    // if it needs more data, it returns the number of items it needs
    const n = dataNeeded()
    if (n > 0) {
      this.loadNextItems(n, subscription)
    }
    return true
  }

  private sendChangesToPipelineWithTracking(
    changes: Iterable<ChangeMessage<any, string | number>>,
    subscription: CollectionSubscription,
  ) {
    const orderByInfo = this.getOrderByInfo()
    if (!orderByInfo) {
      this.sendChangesToPipeline(changes)
      return
    }

    const trackedChanges = this.trackSentValues(changes, orderByInfo.comparator)

    // Cache the loadMoreIfNeeded callback on the subscription using a symbol property.
    // This ensures we pass the same function instance to the scheduler each time,
    // allowing it to deduplicate callbacks when multiple changes arrive during a transaction.
    type SubscriptionWithLoader = CollectionSubscription & {
      [loadMoreCallbackSymbol]?: () => boolean
    }

    const subscriptionWithLoader = subscription as SubscriptionWithLoader

    subscriptionWithLoader[loadMoreCallbackSymbol] ??=
      this.loadMoreIfNeeded.bind(this, subscription)

    this.sendChangesToPipeline(
      trackedChanges,
      subscriptionWithLoader[loadMoreCallbackSymbol],
    )
  }

  // Loads the next `n` items from the collection
  // starting from the biggest item it has sent
  private loadNextItems(n: number, subscription: CollectionSubscription) {
    const orderByInfo = this.getOrderByInfo()
    if (!orderByInfo) {
      return
    }
    const { orderBy, valueExtractorForRawRow, offset } = orderByInfo
    const biggestSentRow = this.biggest

    // Extract all orderBy column values from the biggest sent row
    // For single-column: returns single value, for multi-column: returns array
    const extractedValues = biggestSentRow
      ? valueExtractorForRawRow(biggestSentRow)
      : undefined

    // Normalize to array format for minValues
    const minValues =
      extractedValues !== undefined
        ? Array.isArray(extractedValues)
          ? extractedValues
          : [extractedValues]
        : undefined

    // Normalize the orderBy clauses such that the references are relative to the collection
    const normalizedOrderBy = normalizeOrderByPaths(orderBy, this.alias)

    // Take the `n` items after the biggest sent value
    // Pass the current window offset to ensure proper deduplication
    subscription.requestLimitedSnapshot({
      orderBy: normalizedOrderBy,
      limit: n,
      minValues,
      offset,
    })
  }

  private getWhereClauseForAlias(): BasicExpression<boolean> | undefined {
    const sourceWhereClausesCache =
      this.collectionConfigBuilder.sourceWhereClausesCache
    if (!sourceWhereClausesCache) {
      return undefined
    }
    return sourceWhereClausesCache.get(this.alias)
  }

  private getOrderByInfo(): OrderByOptimizationInfo | undefined {
    const info =
      this.collectionConfigBuilder.optimizableOrderByCollections[
        this.collectionId
      ]
    if (info && info.alias === this.alias) {
      return info
    }
    return undefined
  }

  private *trackSentValues(
    changes: Iterable<ChangeMessage<any, string | number>>,
    comparator: (a: any, b: any) => number,
  ) {
    for (const change of changes) {
      // Only track inserts/updates for cursor positioning, not deletes
      if (change.type !== `delete`) {
        if (!this.biggest) {
          this.biggest = change.value
        } else if (comparator(this.biggest, change.value) < 0) {
          this.biggest = change.value
        }
      }

      yield change
    }
  }
}

/**
 * Helper function to send changes to a D2 input stream
 */
function sendChangesToInput(
  input: RootStreamBuilder<unknown>,
  changes: Iterable<ChangeMessage>,
  getKey: (item: ChangeMessage[`value`]) => any,
): number {
  const multiSetArray: MultiSetArray<unknown> = []
  for (const change of changes) {
    const key = getKey(change.value)
    if (change.type === `insert`) {
      multiSetArray.push([[key, change.value], 1])
    } else if (change.type === `update`) {
      multiSetArray.push([[key, change.previousValue], -1])
      multiSetArray.push([[key, change.value], 1])
    } else {
      // change.type === `delete`
      multiSetArray.push([[key, change.value], -1])
    }
  }

  if (multiSetArray.length !== 0) {
    input.sendData(new MultiSet(multiSetArray))
  }

  return multiSetArray.length
}

/** Splits updates into a delete of the old value and an insert of the new value */
function* splitUpdates<
  T extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
>(
  changes: Iterable<ChangeMessage<T, TKey>>,
): Generator<ChangeMessage<T, TKey>> {
  for (const change of changes) {
    if (change.type === `update`) {
      yield { type: `delete`, key: change.key, value: change.previousValue! }
      yield { type: `insert`, key: change.key, value: change.value }
    } else {
      yield change
    }
  }
}
