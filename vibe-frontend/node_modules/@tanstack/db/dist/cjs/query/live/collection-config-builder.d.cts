import { LIVE_QUERY_INTERNAL, LiveQueryInternalUtils } from './internal.js';
import { WindowOptions } from '../compiler/index.js';
import { SchedulerContextId } from '../../scheduler.js';
import { CollectionSubscription } from '../../collection/subscription.js';
import { OrderByOptimizationInfo } from '../compiler/order-by.js';
import { Collection } from '../../collection/index.js';
import { CollectionConfigSingleRowOption, SyncConfig, UtilsRecord } from '../../types.js';
import { Context, GetResult } from '../builder/types.js';
import { BasicExpression, QueryIR } from '../ir.js';
import { LazyCollectionCallbacks } from '../compiler/joins.js';
import { FullSyncState, LiveQueryCollectionConfig } from './types.js';
export type LiveQueryCollectionUtils = UtilsRecord & {
    getRunCount: () => number;
    /**
     * Sets the offset and limit of an ordered query.
     * Is a no-op if the query is not ordered.
     *
     * @returns `true` if no subset loading was triggered, or `Promise<void>` that resolves when the subset has been loaded
     */
    setWindow: (options: WindowOptions) => true | Promise<void>;
    /**
     * Gets the current window (offset and limit) for an ordered query.
     *
     * @returns The current window settings, or `undefined` if the query is not windowed
     */
    getWindow: () => {
        offset: number;
        limit: number;
    } | undefined;
    [LIVE_QUERY_INTERNAL]: LiveQueryInternalUtils;
};
export declare class CollectionConfigBuilder<TContext extends Context, TResult extends object = GetResult<TContext>> {
    private readonly config;
    private readonly id;
    readonly query: QueryIR;
    private readonly collections;
    private readonly collectionByAlias;
    private compiledAliasToCollectionId;
    private readonly resultKeys;
    private readonly orderByIndices;
    private readonly compare?;
    private readonly compareOptions?;
    private isGraphRunning;
    private runCount;
    currentSyncConfig: Parameters<SyncConfig<TResult>[`sync`]>[0] | undefined;
    currentSyncState: FullSyncState | undefined;
    private isInErrorState;
    liveQueryCollection?: Collection<TResult, any, any>;
    private windowFn;
    private currentWindow;
    private maybeRunGraphFn;
    private readonly aliasDependencies;
    private readonly builderDependencies;
    private readonly pendingGraphRuns;
    private unsubscribeFromSchedulerClears?;
    private graphCache;
    private inputsCache;
    private pipelineCache;
    sourceWhereClausesCache: Map<string, BasicExpression<boolean>> | undefined;
    readonly subscriptions: Record<string, CollectionSubscription>;
    lazySourcesCallbacks: Record<string, LazyCollectionCallbacks>;
    readonly lazySources: Set<string>;
    optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>;
    constructor(config: LiveQueryCollectionConfig<TContext, TResult>);
    /**
     * Recursively checks if a query or any of its subqueries contains joins
     */
    private hasJoins;
    getConfig(): CollectionConfigSingleRowOption<TResult> & {
        utils: LiveQueryCollectionUtils;
    };
    setWindow(options: WindowOptions): true | Promise<void>;
    getWindow(): {
        offset: number;
        limit: number;
    } | undefined;
    /**
     * Resolves a collection alias to its collection ID.
     *
     * Uses a two-tier lookup strategy:
     * 1. First checks compiled aliases (includes subquery inner aliases)
     * 2. Falls back to declared aliases from the query's from/join clauses
     *
     * @param alias - The alias to resolve (e.g., "employee", "manager")
     * @returns The collection ID that the alias references
     * @throws {Error} If the alias is not found in either lookup
     */
    getCollectionIdForAlias(alias: string): string;
    isLazyAlias(alias: string): boolean;
    maybeRunGraph(callback?: () => boolean): void;
    /**
     * Schedules a graph run with the transaction-scoped scheduler.
     * Ensures each builder runs at most once per transaction, with automatic dependency tracking
     * to run parent queries before child queries. Outside a transaction, runs immediately.
     *
     * Multiple calls during a transaction are coalesced into a single execution.
     * Dependencies are auto-discovered from subscribed live queries, or can be overridden.
     * Load callbacks are combined when entries merge.
     *
     * Uses the current sync session's config and syncState from instance properties.
     *
     * @param callback - Optional callback to load more data if needed (returns true when done)
     * @param options - Optional scheduling configuration
     * @param options.contextId - Transaction ID to group work; defaults to active transaction
     * @param options.jobId - Unique identifier for this job; defaults to this builder instance
     * @param options.alias - Source alias that triggered this schedule; adds alias-specific dependencies
     * @param options.dependencies - Explicit dependency list; overrides auto-discovered dependencies
     */
    scheduleGraphRun(callback?: () => boolean, options?: {
        contextId?: SchedulerContextId;
        jobId?: unknown;
        alias?: string;
        dependencies?: Array<CollectionConfigBuilder<any, any>>;
    }): void;
    /**
     * Clears pending graph run state for a specific context.
     * Called when the scheduler clears a context (e.g., transaction rollback/abort).
     */
    clearPendingGraphRun(contextId: SchedulerContextId): void;
    /**
     * Returns true if this builder has a pending graph run for the given context.
     */
    hasPendingGraphRun(contextId: SchedulerContextId): boolean;
    /**
     * Executes a pending graph run. Called by the scheduler when dependencies are satisfied.
     * Clears the pending state BEFORE execution so that any re-schedules during the run
     * create fresh state and don't interfere with the current execution.
     * Uses instance sync state - if sync has ended, gracefully returns without executing.
     *
     * @param contextId - Optional context ID to look up pending state
     * @param pendingParam - For immediate execution (no context), pending state is passed directly
     */
    private executeGraphRun;
    private getSyncConfig;
    incrementRunCount(): void;
    getRunCount(): number;
    private syncFn;
    /**
     * Compiles the query pipeline with all declared aliases.
     */
    private compileBasePipeline;
    private maybeCompileBasePipeline;
    private extendPipelineWithChangeProcessing;
    private applyChanges;
    /**
     * Handle status changes from source collections
     */
    private handleSourceStatusChange;
    /**
     * Update the live query status based on source collection statuses
     */
    private updateLiveQueryStatus;
    /**
     * Transition the live query to error state
     */
    private transitionToError;
    private allCollectionsReady;
    /**
     * Creates per-alias subscriptions enabling self-join support.
     * Each alias gets its own subscription with independent filters, even for the same collection.
     * Example: `{ employee: col, manager: col }` creates two separate subscriptions.
     */
    private subscribeToAllCollections;
}
