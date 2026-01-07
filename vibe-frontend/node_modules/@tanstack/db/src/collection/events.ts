import { EventEmitter } from '../event-emitter.js'
import type { Collection } from './index.js'
import type { CollectionStatus } from '../types.js'

/**
 * Event emitted when the collection status changes
 */
export interface CollectionStatusChangeEvent {
  type: `status:change`
  collection: Collection
  previousStatus: CollectionStatus
  status: CollectionStatus
}

/**
 * Event emitted when the collection status changes to a specific status
 */
export interface CollectionStatusEvent<T extends CollectionStatus> {
  type: `status:${T}`
  collection: Collection
  previousStatus: CollectionStatus
  status: T
}

/**
 * Event emitted when the number of subscribers to the collection changes
 */
export interface CollectionSubscribersChangeEvent {
  type: `subscribers:change`
  collection: Collection
  previousSubscriberCount: number
  subscriberCount: number
}

/**
 * Event emitted when the collection's loading more state changes
 */
export interface CollectionLoadingSubsetChangeEvent {
  type: `loadingSubset:change`
  collection: Collection<any, any, any, any, any>
  isLoadingSubset: boolean
  previousIsLoadingSubset: boolean
  loadingSubsetTransition: `start` | `end`
}

/**
 * Event emitted when the collection is truncated (all data cleared)
 */
export interface CollectionTruncateEvent {
  type: `truncate`
  collection: Collection<any, any, any, any, any>
}

export type AllCollectionEvents = {
  'status:change': CollectionStatusChangeEvent
  'subscribers:change': CollectionSubscribersChangeEvent
  'loadingSubset:change': CollectionLoadingSubsetChangeEvent
  truncate: CollectionTruncateEvent
} & {
  [K in CollectionStatus as `status:${K}`]: CollectionStatusEvent<K>
}

export type CollectionEvent =
  | AllCollectionEvents[keyof AllCollectionEvents]
  | CollectionStatusChangeEvent
  | CollectionSubscribersChangeEvent
  | CollectionLoadingSubsetChangeEvent
  | CollectionTruncateEvent

export type CollectionEventHandler<T extends keyof AllCollectionEvents> = (
  event: AllCollectionEvents[T],
) => void

export class CollectionEventsManager extends EventEmitter<AllCollectionEvents> {
  private collection!: Collection<any, any, any, any, any>

  constructor() {
    super()
  }

  setDeps(deps: { collection: Collection<any, any, any, any, any> }) {
    this.collection = deps.collection
  }

  /**
   * Emit an event to all listeners
   * Public API for emitting collection events
   */
  emit<T extends keyof AllCollectionEvents>(
    event: T,
    eventPayload: AllCollectionEvents[T],
  ): void {
    this.emitInner(event, eventPayload)
  }

  emitStatusChange<T extends CollectionStatus>(
    status: T,
    previousStatus: CollectionStatus,
  ) {
    this.emit(`status:change`, {
      type: `status:change`,
      collection: this.collection,
      previousStatus,
      status,
    })

    // Emit specific status event using type assertion
    const eventKey: `status:${T}` = `status:${status}`
    this.emit(eventKey, {
      type: eventKey,
      collection: this.collection,
      previousStatus,
      status,
    } as AllCollectionEvents[`status:${T}`])
  }

  emitSubscribersChange(
    subscriberCount: number,
    previousSubscriberCount: number,
  ) {
    this.emit(`subscribers:change`, {
      type: `subscribers:change`,
      collection: this.collection,
      previousSubscriberCount,
      subscriberCount,
    })
  }

  cleanup() {
    this.clearListeners()
  }
}
