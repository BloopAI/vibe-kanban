import { StandardSchemaV1 } from '@standard-schema/spec';
import { CollectionConfig, LoadSubsetOptions } from '../types.js';
import { CollectionImpl } from './index.js';
import { CollectionStateManager } from './state.js';
import { CollectionLifecycleManager } from './lifecycle.js';
import { CollectionEventsManager } from './events.js';
export declare class CollectionSyncManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    private collection;
    private state;
    private lifecycle;
    private _events;
    private config;
    private id;
    private syncMode;
    preloadPromise: Promise<void> | null;
    syncCleanupFn: (() => void) | null;
    syncLoadSubsetFn: ((options: LoadSubsetOptions) => true | Promise<void>) | null;
    syncUnloadSubsetFn: ((options: LoadSubsetOptions) => void) | null;
    private pendingLoadSubsetPromises;
    /**
     * Creates a new CollectionSyncManager instance
     */
    constructor(config: CollectionConfig<TOutput, TKey, TSchema>, id: string);
    setDeps(deps: {
        collection: CollectionImpl<TOutput, TKey, any, TSchema, TInput>;
        state: CollectionStateManager<TOutput, TKey, TSchema, TInput>;
        lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
        events: CollectionEventsManager;
    }): void;
    /**
     * Start the sync process for this collection
     * This is called when the collection is first accessed or preloaded
     */
    startSync(): void;
    /**
     * Preload the collection data by starting sync if not already started
     * Multiple concurrent calls will share the same promise
     */
    preload(): Promise<void>;
    /**
     * Gets whether the collection is currently loading more data
     */
    get isLoadingSubset(): boolean;
    /**
     * Tracks a load promise for isLoadingSubset state.
     * @internal This is for internal coordination (e.g., live-query glue code), not for general use.
     */
    trackLoadPromise(promise: Promise<void>): void;
    /**
     * Requests the sync layer to load more data.
     * @param options Options to control what data is being loaded
     * @returns If data loading is asynchronous, this method returns a promise that resolves when the data is loaded.
     *          Returns true if no sync function is configured, if syncMode is 'eager', or if there is no work to do.
     */
    loadSubset(options: LoadSubsetOptions): Promise<void> | true;
    /**
     * Notifies the sync layer that a subset is no longer needed.
     * @param options Options that identify what data is being unloaded
     */
    unloadSubset(options: LoadSubsetOptions): void;
    cleanup(): void;
}
