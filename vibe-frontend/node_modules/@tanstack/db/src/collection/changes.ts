import { NegativeActiveSubscribersError } from '../errors'
import { CollectionSubscription } from './subscription.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ChangeMessage, SubscribeChangesOptions } from '../types'
import type { CollectionLifecycleManager } from './lifecycle.js'
import type { CollectionSyncManager } from './sync.js'
import type { CollectionEventsManager } from './events.js'
import type { CollectionImpl } from './index.js'

export class CollectionChangesManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  private lifecycle!: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  private sync!: CollectionSyncManager<TOutput, TKey, TSchema, TInput>
  private events!: CollectionEventsManager
  private collection!: CollectionImpl<TOutput, TKey, any, TSchema, TInput>

  public activeSubscribersCount = 0
  public changeSubscriptions = new Set<CollectionSubscription>()
  public batchedEvents: Array<ChangeMessage<TOutput, TKey>> = []
  public shouldBatchEvents = false

  /**
   * Creates a new CollectionChangesManager instance
   */
  constructor() {}

  public setDeps(deps: {
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
    sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>
    events: CollectionEventsManager
    collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>
  }) {
    this.lifecycle = deps.lifecycle
    this.sync = deps.sync
    this.events = deps.events
    this.collection = deps.collection
  }

  /**
   * Emit an empty ready event to notify subscribers that the collection is ready
   * This bypasses the normal empty array check in emitEvents
   */
  public emitEmptyReadyEvent(): void {
    // Emit empty array directly to all subscribers
    for (const subscription of this.changeSubscriptions) {
      subscription.emitEvents([])
    }
  }

  /**
   * Emit events either immediately or batch them for later emission
   */
  public emitEvents(
    changes: Array<ChangeMessage<TOutput, TKey>>,
    forceEmit = false,
  ): void {
    // Skip batching for user actions (forceEmit=true) to keep UI responsive
    if (this.shouldBatchEvents && !forceEmit) {
      // Add events to the batch
      this.batchedEvents.push(...changes)
      return
    }

    // Either we're not batching, or we're forcing emission (user action or ending batch cycle)
    let eventsToEmit = changes

    if (forceEmit) {
      // Force emit is used to end a batch (e.g. after a sync commit). Combine any
      // buffered optimistic events with the final changes so subscribers see the
      // whole picture, even if the sync diff is empty.
      if (this.batchedEvents.length > 0) {
        eventsToEmit = [...this.batchedEvents, ...changes]
      }
      this.batchedEvents = []
      this.shouldBatchEvents = false
    }

    if (eventsToEmit.length === 0) {
      return
    }

    // Emit to all listeners
    for (const subscription of this.changeSubscriptions) {
      subscription.emitEvents(eventsToEmit)
    }
  }

  /**
   * Subscribe to changes in the collection
   */
  public subscribeChanges(
    callback: (changes: Array<ChangeMessage<TOutput>>) => void,
    options: SubscribeChangesOptions = {},
  ): CollectionSubscription {
    // Start sync and track subscriber
    this.addSubscriber()

    const subscription = new CollectionSubscription(this.collection, callback, {
      ...options,
      onUnsubscribe: () => {
        this.removeSubscriber()
        this.changeSubscriptions.delete(subscription)
      },
    })

    if (options.includeInitialState) {
      subscription.requestSnapshot({ trackLoadSubsetPromise: false })
    } else if (options.includeInitialState === false) {
      // When explicitly set to false (not just undefined), mark all state as "seen"
      // so that all future changes (including deletes) pass through unfiltered.
      subscription.markAllStateAsSeen()
    }

    // Add to batched listeners
    this.changeSubscriptions.add(subscription)

    return subscription
  }

  /**
   * Increment the active subscribers count and start sync if needed
   */
  private addSubscriber(): void {
    const previousSubscriberCount = this.activeSubscribersCount
    this.activeSubscribersCount++
    this.lifecycle.cancelGCTimer()

    // Start sync if collection was cleaned up
    if (
      this.lifecycle.status === `cleaned-up` ||
      this.lifecycle.status === `idle`
    ) {
      this.sync.startSync()
    }

    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount,
    )
  }

  /**
   * Decrement the active subscribers count and start GC timer if needed
   */
  private removeSubscriber(): void {
    const previousSubscriberCount = this.activeSubscribersCount
    this.activeSubscribersCount--

    if (this.activeSubscribersCount === 0) {
      this.lifecycle.startGCTimer()
    } else if (this.activeSubscribersCount < 0) {
      throw new NegativeActiveSubscribersError()
    }

    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount,
    )
  }

  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  public cleanup(): void {
    this.batchedEvents = []
    this.shouldBatchEvents = false
  }
}
