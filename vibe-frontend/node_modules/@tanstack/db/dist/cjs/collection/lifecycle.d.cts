import { StandardSchemaV1 } from '@standard-schema/spec';
import { CollectionConfig, CollectionStatus } from '../types.cjs';
import { CollectionEventsManager } from './events.cjs';
import { CollectionIndexesManager } from './indexes.cjs';
import { CollectionChangesManager } from './changes.cjs';
import { CollectionSyncManager } from './sync.cjs';
import { CollectionStateManager } from './state.cjs';
export declare class CollectionLifecycleManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    private config;
    private id;
    private indexes;
    private events;
    private changes;
    private sync;
    private state;
    status: CollectionStatus;
    hasBeenReady: boolean;
    hasReceivedFirstCommit: boolean;
    onFirstReadyCallbacks: Array<() => void>;
    gcTimeoutId: ReturnType<typeof setTimeout> | null;
    private idleCallbackId;
    /**
     * Creates a new CollectionLifecycleManager instance
     */
    constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string);
    setDeps(deps: {
        indexes: CollectionIndexesManager<TOutput, TKey, TSchema, TInput>;
        events: CollectionEventsManager;
        changes: CollectionChangesManager<TOutput, TKey, TSchema, TInput>;
        sync: CollectionSyncManager<TOutput, TKey, TSchema, TInput>;
        state: CollectionStateManager<TOutput, TKey, TSchema, TInput>;
    }): void;
    /**
     * Validates state transitions to prevent invalid status changes
     */
    validateStatusTransition(from: CollectionStatus, to: CollectionStatus): void;
    /**
     * Safely update the collection status with validation
     * @private
     */
    setStatus(newStatus: CollectionStatus, allowReady?: boolean): void;
    /**
     * Validates that the collection is in a usable state for data operations
     * @private
     */
    validateCollectionUsable(operation: string): void;
    /**
     * Mark the collection as ready for use
     * This is called by sync implementations to explicitly signal that the collection is ready,
     * providing a more intuitive alternative to using commits for readiness signaling
     * @private - Should only be called by sync implementations
     */
    markReady(): void;
    /**
     * Start the garbage collection timer
     * Called when the collection becomes inactive (no subscribers)
     */
    startGCTimer(): void;
    /**
     * Cancel the garbage collection timer
     * Called when the collection becomes active again
     */
    cancelGCTimer(): void;
    /**
     * Schedule cleanup to run during browser idle time
     * This prevents blocking the UI thread during cleanup operations
     */
    private scheduleIdleCleanup;
    /**
     * Perform cleanup operations, optionally in chunks during idle time
     * @returns true if cleanup was completed, false if it was rescheduled
     */
    private performCleanup;
    /**
     * Register a callback to be executed when the collection first becomes ready
     * Useful for preloading collections
     * @param callback Function to call when the collection first becomes ready
     */
    onFirstReady(callback: () => void): void;
    cleanup(): void;
}
