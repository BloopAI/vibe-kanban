import { SortedMap } from '../SortedMap.cjs';
import { Transaction } from '../transactions.cjs';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { CollectionConfig, OptimisticChangeMessage } from '../types.cjs';
import { CollectionImpl } from './index.js';
import { CollectionLifecycleManager } from './lifecycle.cjs';
import { CollectionChangesManager } from './changes.cjs';
import { CollectionIndexesManager } from './indexes.cjs';
import { CollectionEventsManager } from './events.cjs';
interface PendingSyncedTransaction<T extends object = Record<string, unknown>, TKey extends string | number = string | number> {
    committed: boolean;
    operations: Array<OptimisticChangeMessage<T>>;
    truncate?: boolean;
    deletedKeys: Set<string | number>;
    optimisticSnapshot?: {
        upserts: Map<TKey, T>;
        deletes: Set<TKey>;
    };
}
export declare class CollectionStateManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    config: CollectionConfig<TOutput, TKey, TSchema>;
    collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>;
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
    changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>;
    indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>;
    private _events;
    transactions: SortedMap<string, Transaction<any>>;
    pendingSyncedTransactions: Array<PendingSyncedTransaction<TOutput, TKey>>;
    syncedData: SortedMap<TKey, TOutput>;
    syncedMetadata: Map<TKey, unknown>;
    optimisticUpserts: Map<TKey, TOutput>;
    optimisticDeletes: Set<TKey>;
    size: number;
    syncedKeys: Set<TKey>;
    preSyncVisibleState: Map<TKey, TOutput>;
    recentlySyncedKeys: Set<TKey>;
    hasReceivedFirstCommit: boolean;
    isCommittingSyncTransactions: boolean;
    /**
     * Creates a new CollectionState manager
     */
    constructor(config: CollectionConfig<TOutput, TKey, TSchema>);
    setDeps(deps: {
        collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>;
        lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
        changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>;
        indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>;
        events: CollectionEventsManager;
    }): void;
    /**
     * Get the current value for a key (virtual derived state)
     */
    get(key: TKey): TOutput | undefined;
    /**
     * Check if a key exists in the collection (virtual derived state)
     */
    has(key: TKey): boolean;
    /**
     * Get all keys (virtual derived state)
     */
    keys(): IterableIterator<TKey>;
    /**
     * Get all values (virtual derived state)
     */
    values(): IterableIterator<TOutput>;
    /**
     * Get all entries (virtual derived state)
     */
    entries(): IterableIterator<[TKey, TOutput]>;
    /**
     * Get all entries (virtual derived state)
     */
    [Symbol.iterator](): IterableIterator<[TKey, TOutput]>;
    /**
     * Execute a callback for each entry in the collection
     */
    forEach(callbackfn: (value: TOutput, key: TKey, index: number) => void): void;
    /**
     * Create a new array with the results of calling a function for each entry in the collection
     */
    map<U>(callbackfn: (value: TOutput, key: TKey, index: number) => U): Array<U>;
    /**
     * Check if the given collection is this collection
     * @param collection The collection to check
     * @returns True if the given collection is this collection, false otherwise
     */
    private isThisCollection;
    /**
     * Recompute optimistic state from active transactions
     */
    recomputeOptimisticState(triggeredByUserAction?: boolean): void;
    /**
     * Calculate the current size based on synced data and optimistic changes
     */
    private calculateSize;
    /**
     * Collect events for optimistic changes
     */
    private collectOptimisticChanges;
    /**
     * Get the previous value for a key given previous optimistic state
     */
    private getPreviousValue;
    /**
     * Attempts to commit pending synced transactions if there are no active transactions
     * This method processes operations from pending transactions and applies them to the synced data
     */
    commitPendingTransactions: () => void;
    /**
     * Schedule cleanup of a transaction when it completes
     */
    scheduleTransactionCleanup(transaction: Transaction<any>): void;
    /**
     * Capture visible state for keys that will be affected by pending sync operations
     * This must be called BEFORE onTransactionStateChange clears optimistic state
     */
    capturePreSyncVisibleState(): void;
    /**
     * Trigger a recomputation when transactions change
     * This method should be called by the Transaction class when state changes
     */
    onTransactionStateChange(): void;
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup(): void;
}
export {};
