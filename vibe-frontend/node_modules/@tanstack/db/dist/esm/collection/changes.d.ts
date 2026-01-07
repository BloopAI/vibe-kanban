import { CollectionSubscription } from './subscription.js';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { ChangeMessage, SubscribeChangesOptions } from '../types.js';
import { CollectionLifecycleManager } from './lifecycle.js';
import { CollectionSyncManager } from './sync.js';
import { CollectionEventsManager } from './events.js';
import { CollectionImpl } from './index.js';
export declare class CollectionChangesManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    private lifecycle;
    private sync;
    private events;
    private collection;
    activeSubscribersCount: number;
    changeSubscriptions: Set<CollectionSubscription>;
    batchedEvents: Array<ChangeMessage<TOutput, TKey>>;
    shouldBatchEvents: boolean;
    /**
     * Creates a new CollectionChangesManager instance
     */
    constructor();
    setDeps(deps: {
        lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
        sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>;
        events: CollectionEventsManager;
        collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>;
    }): void;
    /**
     * Emit an empty ready event to notify subscribers that the collection is ready
     * This bypasses the normal empty array check in emitEvents
     */
    emitEmptyReadyEvent(): void;
    /**
     * Emit events either immediately or batch them for later emission
     */
    emitEvents(changes: Array<ChangeMessage<TOutput, TKey>>, forceEmit?: boolean): void;
    /**
     * Subscribe to changes in the collection
     */
    subscribeChanges(callback: (changes: Array<ChangeMessage<TOutput>>) => void, options?: SubscribeChangesOptions): CollectionSubscription;
    /**
     * Increment the active subscribers count and start sync if needed
     */
    private addSubscriber;
    /**
     * Decrement the active subscribers count and start GC timer if needed
     */
    private removeSubscriber;
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup(): void;
}
