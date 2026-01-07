import { EventEmitter } from '../event-emitter.js';
import { Collection } from './index.js';
import { CollectionStatus } from '../types.js';
/**
 * Event emitted when the collection status changes
 */
export interface CollectionStatusChangeEvent {
    type: `status:change`;
    collection: Collection;
    previousStatus: CollectionStatus;
    status: CollectionStatus;
}
/**
 * Event emitted when the collection status changes to a specific status
 */
export interface CollectionStatusEvent<T extends CollectionStatus> {
    type: `status:${T}`;
    collection: Collection;
    previousStatus: CollectionStatus;
    status: T;
}
/**
 * Event emitted when the number of subscribers to the collection changes
 */
export interface CollectionSubscribersChangeEvent {
    type: `subscribers:change`;
    collection: Collection;
    previousSubscriberCount: number;
    subscriberCount: number;
}
/**
 * Event emitted when the collection's loading more state changes
 */
export interface CollectionLoadingSubsetChangeEvent {
    type: `loadingSubset:change`;
    collection: Collection<any, any, any, any, any>;
    isLoadingSubset: boolean;
    previousIsLoadingSubset: boolean;
    loadingSubsetTransition: `start` | `end`;
}
/**
 * Event emitted when the collection is truncated (all data cleared)
 */
export interface CollectionTruncateEvent {
    type: `truncate`;
    collection: Collection<any, any, any, any, any>;
}
export type AllCollectionEvents = {
    'status:change': CollectionStatusChangeEvent;
    'subscribers:change': CollectionSubscribersChangeEvent;
    'loadingSubset:change': CollectionLoadingSubsetChangeEvent;
    truncate: CollectionTruncateEvent;
} & {
    [K in CollectionStatus as `status:${K}`]: CollectionStatusEvent<K>;
};
export type CollectionEvent = AllCollectionEvents[keyof AllCollectionEvents] | CollectionStatusChangeEvent | CollectionSubscribersChangeEvent | CollectionLoadingSubsetChangeEvent | CollectionTruncateEvent;
export type CollectionEventHandler<T extends keyof AllCollectionEvents> = (event: AllCollectionEvents[T]) => void;
export declare class CollectionEventsManager extends EventEmitter<AllCollectionEvents> {
    private collection;
    constructor();
    setDeps(deps: {
        collection: Collection<any, any, any, any, any>;
    }): void;
    /**
     * Emit an event to all listeners
     * Public API for emitting collection events
     */
    emit<T extends keyof AllCollectionEvents>(event: T, eventPayload: AllCollectionEvents[T]): void;
    emitStatusChange<T extends CollectionStatus>(status: T, previousStatus: CollectionStatus): void;
    emitSubscribersChange(subscriberCount: number, previousSubscriberCount: number): void;
    cleanup(): void;
}
