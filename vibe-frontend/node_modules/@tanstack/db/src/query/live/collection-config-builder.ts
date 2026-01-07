import { D2, output } from '@tanstack/db-ivm'
import { compileQuery } from '../compiler/index.js'
import { buildQuery, getQueryIR } from '../builder/index.js'
import {
  MissingAliasInputsError,
  SetWindowRequiresOrderByError,
} from '../../errors.js'
import { transactionScopedScheduler } from '../../scheduler.js'
import { getActiveTransaction } from '../../transactions.js'
import { CollectionSubscriber } from './collection-subscriber.js'
import { getCollectionBuilder } from './collection-registry.js'
import { LIVE_QUERY_INTERNAL } from './internal.js'
import type { LiveQueryInternalUtils } from './internal.js'
import type { WindowOptions } from '../compiler/index.js'
import type { SchedulerContextId } from '../../scheduler.js'
import type { CollectionSubscription } from '../../collection/subscription.js'
import type { RootStreamBuilder } from '@tanstack/db-ivm'
import type { OrderByOptimizationInfo } from '../compiler/order-by.js'
import type { Collection } from '../../collection/index.js'
import type {
  CollectionConfigSingleRowOption,
  KeyedStream,
  ResultStream,
  StringCollationConfig,
  SyncConfig,
  UtilsRecord,
} from '../../types.js'
import type { Context, GetResult } from '../builder/types.js'
import type { BasicExpression, QueryIR } from '../ir.js'
import type { LazyCollectionCallbacks } from '../compiler/joins.js'
import type {
  Changes,
  FullSyncState,
  LiveQueryCollectionConfig,
  SyncState,
} from './types.js'
import type { AllCollectionEvents } from '../../collection/events.js'

export type LiveQueryCollectionUtils = UtilsRecord & {
  getRunCount: () => number
  /**
   * Sets the offset and limit of an ordered query.
   * Is a no-op if the query is not ordered.
   *
   * @returns `true` if no subset loading was triggered, or `Promise<void>` that resolves when the subset has been loaded
   */
  setWindow: (options: WindowOptions) => true | Promise<void>
  /**
   * Gets the current window (offset and limit) for an ordered query.
   *
   * @returns The current window settings, or `undefined` if the query is not windowed
   */
  getWindow: () => { offset: number; limit: number } | undefined
  [LIVE_QUERY_INTERNAL]: LiveQueryInternalUtils
}

type PendingGraphRun = {
  loadCallbacks: Set<() => boolean>
}

// Global counter for auto-generated collection IDs
let liveQueryCollectionCounter = 0

type SyncMethods<TResult extends object> = Parameters<
  SyncConfig<TResult>[`sync`]
>[0]

export class CollectionConfigBuilder<
  TContext extends Context,
  TResult extends object = GetResult<TContext>,
> {
  private readonly id: string
  readonly query: QueryIR
  private readonly collections: Record<string, Collection<any, any, any>>
  private readonly collectionByAlias: Record<string, Collection<any, any, any>>
  // Populated during compilation with all aliases (including subquery inner aliases)
  private compiledAliasToCollectionId: Record<string, string> = {}

  // WeakMap to store the keys of the results
  // so that we can retrieve them in the getKey function
  private readonly resultKeys = new WeakMap<object, unknown>()

  // WeakMap to store the orderBy index for each result
  private readonly orderByIndices = new WeakMap<object, string>()

  private readonly compare?: (val1: TResult, val2: TResult) => number
  private readonly compareOptions?: StringCollationConfig

  private isGraphRunning = false
  private runCount = 0

  // Current sync session state (set when sync starts, cleared when it stops)
  // Public for testing purposes (CollectionConfigBuilder is internal, not public API)
  public currentSyncConfig:
    | Parameters<SyncConfig<TResult>[`sync`]>[0]
    | undefined
  public currentSyncState: FullSyncState | undefined

  // Error state tracking
  private isInErrorState = false

  // Reference to the live query collection for error state transitions
  public liveQueryCollection?: Collection<TResult, any, any>

  private windowFn: ((options: WindowOptions) => void) | undefined
  private currentWindow: WindowOptions | undefined

  private maybeRunGraphFn: (() => void) | undefined

  private readonly aliasDependencies: Record<
    string,
    Array<CollectionConfigBuilder<any, any>>
  > = {}

  private readonly builderDependencies = new Set<
    CollectionConfigBuilder<any, any>
  >()

  // Pending graph runs per scheduler context (e.g., per transaction)
  // The builder manages its own state; the scheduler just orchestrates execution order
  // Only stores callbacks - if sync ends, pending jobs gracefully no-op
  private readonly pendingGraphRuns = new Map<
    SchedulerContextId,
    PendingGraphRun
  >()

  // Unsubscribe function for scheduler's onClear listener
  // Registered when sync starts, unregistered when sync stops
  // Prevents memory leaks by releasing the scheduler's reference to this builder
  private unsubscribeFromSchedulerClears?: () => void

  private graphCache: D2 | undefined
  private inputsCache: Record<string, RootStreamBuilder<unknown>> | undefined
  private pipelineCache: ResultStream | undefined
  public sourceWhereClausesCache:
    | Map<string, BasicExpression<boolean>>
    | undefined

  // Map of source alias to subscription
  readonly subscriptions: Record<string, CollectionSubscription> = {}
  // Map of source aliases to functions that load keys for that lazy source
  lazySourcesCallbacks: Record<string, LazyCollectionCallbacks> = {}
  // Set of source aliases that are lazy (don't load initial state)
  readonly lazySources = new Set<string>()
  // Set of collection IDs that include an optimizable ORDER BY clause
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo> = {}

  constructor(
    private readonly config: LiveQueryCollectionConfig<TContext, TResult>,
  ) {
    // Generate a unique ID if not provided
    this.id = config.id || `live-query-${++liveQueryCollectionCounter}`

    this.query = buildQueryFromConfig(config)
    this.collections = extractCollectionsFromQuery(this.query)
    const collectionAliasesById = extractCollectionAliases(this.query)

    // Build a reverse lookup map from alias to collection instance.
    // This enables self-join support where the same collection can be referenced
    // multiple times with different aliases (e.g., { employee: col, manager: col })
    this.collectionByAlias = {}
    for (const [collectionId, aliases] of collectionAliasesById.entries()) {
      const collection = this.collections[collectionId]
      if (!collection) continue
      for (const alias of aliases) {
        this.collectionByAlias[alias] = collection
      }
    }

    // Create compare function for ordering if the query has orderBy
    if (this.query.orderBy && this.query.orderBy.length > 0) {
      this.compare = createOrderByComparator<TResult>(this.orderByIndices)
    }

    // Use explicitly provided compareOptions if available, otherwise inherit from FROM collection
    this.compareOptions =
      this.config.defaultStringCollation ??
      extractCollectionFromSource(this.query).compareOptions

    // Compile the base pipeline once initially
    // This is done to ensure that any errors are thrown immediately and synchronously
    this.compileBasePipeline()
  }

  /**
   * Recursively checks if a query or any of its subqueries contains joins
   */
  private hasJoins(query: QueryIR): boolean {
    // Check if this query has joins
    if (query.join && query.join.length > 0) {
      return true
    }

    // Recursively check subqueries in the from clause
    if (query.from.type === `queryRef`) {
      if (this.hasJoins(query.from.query)) {
        return true
      }
    }

    return false
  }

  getConfig(): CollectionConfigSingleRowOption<TResult> & {
    utils: LiveQueryCollectionUtils
  } {
    return {
      id: this.id,
      getKey:
        this.config.getKey ||
        ((item) => this.resultKeys.get(item) as string | number),
      sync: this.getSyncConfig(),
      compare: this.compare,
      defaultStringCollation: this.compareOptions,
      gcTime: this.config.gcTime || 5000, // 5 seconds by default for live queries
      schema: this.config.schema,
      onInsert: this.config.onInsert,
      onUpdate: this.config.onUpdate,
      onDelete: this.config.onDelete,
      startSync: this.config.startSync,
      singleResult: this.query.singleResult,
      utils: {
        getRunCount: this.getRunCount.bind(this),
        setWindow: this.setWindow.bind(this),
        getWindow: this.getWindow.bind(this),
        [LIVE_QUERY_INTERNAL]: {
          getBuilder: () => this,
          hasCustomGetKey: !!this.config.getKey,
          hasJoins: this.hasJoins(this.query),
        },
      },
    }
  }

  setWindow(options: WindowOptions): true | Promise<void> {
    if (!this.windowFn) {
      throw new SetWindowRequiresOrderByError()
    }

    this.currentWindow = options
    this.windowFn(options)
    this.maybeRunGraphFn?.()

    // Check if loading a subset was triggered
    if (this.liveQueryCollection?.isLoadingSubset) {
      // Loading was triggered, return a promise that resolves when it completes
      return new Promise<void>((resolve) => {
        const unsubscribe = this.liveQueryCollection!.on(
          `loadingSubset:change`,
          (event) => {
            if (!event.isLoadingSubset) {
              unsubscribe()
              resolve()
            }
          },
        )
      })
    }

    // No loading was triggered
    return true
  }

  getWindow(): { offset: number; limit: number } | undefined {
    // Only return window if this is a windowed query (has orderBy and windowFn)
    if (!this.windowFn || !this.currentWindow) {
      return undefined
    }
    return {
      offset: this.currentWindow.offset ?? 0,
      limit: this.currentWindow.limit ?? 0,
    }
  }

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
  getCollectionIdForAlias(alias: string): string {
    const compiled = this.compiledAliasToCollectionId[alias]
    if (compiled) {
      return compiled
    }
    const collection = this.collectionByAlias[alias]
    if (collection) {
      return collection.id
    }
    throw new Error(`Unknown source alias "${alias}"`)
  }

  isLazyAlias(alias: string): boolean {
    return this.lazySources.has(alias)
  }

  // The callback function is called after the graph has run.
  // This gives the callback a chance to load more data if needed,
  // that's used to optimize orderBy operators that set a limit,
  // in order to load some more data if we still don't have enough rows after the pipeline has run.
  // That can happen because even though we load N rows, the pipeline might filter some of these rows out
  // causing the orderBy operator to receive less than N rows or even no rows at all.
  // So this callback would notice that it doesn't have enough rows and load some more.
  // The callback returns a boolean, when it's true it's done loading data and we can mark the collection as ready.
  maybeRunGraph(callback?: () => boolean) {
    if (this.isGraphRunning) {
      // no nested runs of the graph
      // which is possible if the `callback`
      // would call `maybeRunGraph` e.g. after it has loaded some more data
      return
    }

    // Should only be called when sync is active
    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `maybeRunGraph called without active sync session. This should not happen.`,
      )
    }

    this.isGraphRunning = true

    try {
      const { begin, commit } = this.currentSyncConfig
      const syncState = this.currentSyncState

      // Don't run if the live query is in an error state
      if (this.isInErrorState) {
        return
      }

      // Always run the graph if subscribed (eager execution)
      if (syncState.subscribedToAllCollections) {
        while (syncState.graph.pendingWork()) {
          syncState.graph.run()
          callback?.()
        }

        // On the initial run, we may need to do an empty commit to ensure that
        // the collection is initialized
        if (syncState.messagesCount === 0) {
          begin()
          commit()
          // After initial commit, check if we should mark ready
          // (in case all sources were already ready before we subscribed)
          this.updateLiveQueryStatus(this.currentSyncConfig)
        }
      }
    } finally {
      this.isGraphRunning = false
    }
  }

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
  scheduleGraphRun(
    callback?: () => boolean,
    options?: {
      contextId?: SchedulerContextId
      jobId?: unknown
      alias?: string
      dependencies?: Array<CollectionConfigBuilder<any, any>>
    },
  ) {
    const contextId = options?.contextId ?? getActiveTransaction()?.id
    // Use the builder instance as the job ID for deduplication. This is memory-safe
    // because the scheduler's context Map is deleted after flushing (no long-term retention).
    const jobId = options?.jobId ?? this
    const dependentBuilders = (() => {
      if (options?.dependencies) {
        return options.dependencies
      }

      const deps = new Set(this.builderDependencies)
      if (options?.alias) {
        const aliasDeps = this.aliasDependencies[options.alias]
        if (aliasDeps) {
          for (const dep of aliasDeps) {
            deps.add(dep)
          }
        }
      }

      deps.delete(this)

      return Array.from(deps)
    })()

    // Ensure dependent builders are actually scheduled in this context so that
    // dependency edges always point to a real job (or a deduped no-op if already scheduled).
    if (contextId) {
      for (const dep of dependentBuilders) {
        if (typeof dep.scheduleGraphRun === `function`) {
          dep.scheduleGraphRun(undefined, { contextId })
        }
      }
    }

    // We intentionally scope deduplication to the builder instance. Each instance
    // owns caches and compiled pipelines, so sharing work across instances that
    // merely reuse the same string id would execute the wrong builder's graph.

    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `scheduleGraphRun called without active sync session. This should not happen.`,
      )
    }

    // Manage our own state - get or create pending callbacks for this context
    let pending = contextId ? this.pendingGraphRuns.get(contextId) : undefined
    if (!pending) {
      pending = {
        loadCallbacks: new Set(),
      }
      if (contextId) {
        this.pendingGraphRuns.set(contextId, pending)
      }
    }

    // Add callback if provided (this is what accumulates between schedules)
    if (callback) {
      pending.loadCallbacks.add(callback)
    }

    // Schedule execution (scheduler just orchestrates order, we manage state)
    // For immediate execution (no contextId), pass pending directly since it won't be in the map
    const pendingToPass = contextId ? undefined : pending
    transactionScopedScheduler.schedule({
      contextId,
      jobId,
      dependencies: dependentBuilders,
      run: () => this.executeGraphRun(contextId, pendingToPass),
    })
  }

  /**
   * Clears pending graph run state for a specific context.
   * Called when the scheduler clears a context (e.g., transaction rollback/abort).
   */
  clearPendingGraphRun(contextId: SchedulerContextId): void {
    this.pendingGraphRuns.delete(contextId)
  }

  /**
   * Returns true if this builder has a pending graph run for the given context.
   */
  hasPendingGraphRun(contextId: SchedulerContextId): boolean {
    return this.pendingGraphRuns.has(contextId)
  }

  /**
   * Executes a pending graph run. Called by the scheduler when dependencies are satisfied.
   * Clears the pending state BEFORE execution so that any re-schedules during the run
   * create fresh state and don't interfere with the current execution.
   * Uses instance sync state - if sync has ended, gracefully returns without executing.
   *
   * @param contextId - Optional context ID to look up pending state
   * @param pendingParam - For immediate execution (no context), pending state is passed directly
   */
  private executeGraphRun(
    contextId?: SchedulerContextId,
    pendingParam?: PendingGraphRun,
  ): void {
    // Get pending state: either from parameter (no context) or from map (with context)
    // Remove from map BEFORE checking sync state to prevent leaking entries when sync ends
    // before the transaction flushes (e.g., unsubscribe during in-flight transaction)
    const pending =
      pendingParam ??
      (contextId ? this.pendingGraphRuns.get(contextId) : undefined)
    if (contextId) {
      this.pendingGraphRuns.delete(contextId)
    }

    // If no pending state, nothing to execute (context was cleared)
    if (!pending) {
      return
    }

    // If sync session has ended, don't execute (graph is finalized, subscriptions cleared)
    if (!this.currentSyncConfig || !this.currentSyncState) {
      return
    }

    this.incrementRunCount()

    const combinedLoader = () => {
      let allDone = true
      let firstError: unknown
      pending.loadCallbacks.forEach((loader) => {
        try {
          allDone = loader() && allDone
        } catch (error) {
          allDone = false
          firstError ??= error
        }
      })
      if (firstError) {
        throw firstError
      }
      // Returning false signals that callers should schedule another pass.
      return allDone
    }

    this.maybeRunGraph(combinedLoader)
  }

  private getSyncConfig(): SyncConfig<TResult> {
    return {
      rowUpdateMode: `full`,
      sync: this.syncFn.bind(this),
    }
  }

  incrementRunCount() {
    this.runCount++
  }

  getRunCount() {
    return this.runCount
  }

  private syncFn(config: SyncMethods<TResult>) {
    // Store reference to the live query collection for error state transitions
    this.liveQueryCollection = config.collection
    // Store config and syncState as instance properties for the duration of this sync session
    this.currentSyncConfig = config

    const syncState: SyncState = {
      messagesCount: 0,
      subscribedToAllCollections: false,
      unsubscribeCallbacks: new Set<() => void>(),
    }

    // Extend the pipeline such that it applies the incoming changes to the collection
    const fullSyncState = this.extendPipelineWithChangeProcessing(
      config,
      syncState,
    )
    this.currentSyncState = fullSyncState

    // Listen for scheduler context clears to clean up our pending state
    // Re-register on each sync start so the listener is active for the sync session's lifetime
    this.unsubscribeFromSchedulerClears = transactionScopedScheduler.onClear(
      (contextId) => {
        this.clearPendingGraphRun(contextId)
      },
    )

    const loadSubsetDataCallbacks = this.subscribeToAllCollections(
      config,
      fullSyncState,
    )

    this.maybeRunGraphFn = () => this.scheduleGraphRun(loadSubsetDataCallbacks)

    // Initial run with callback to load more data if needed
    this.scheduleGraphRun(loadSubsetDataCallbacks)

    // Return the unsubscribe function
    return () => {
      syncState.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe())

      // Clear current sync session state
      this.currentSyncConfig = undefined
      this.currentSyncState = undefined

      // Clear all pending graph runs to prevent memory leaks from in-flight transactions
      // that may flush after the sync session ends
      this.pendingGraphRuns.clear()

      // Reset caches so a fresh graph/pipeline is compiled on next start
      // This avoids reusing a finalized D2 graph across GC restarts
      this.graphCache = undefined
      this.inputsCache = undefined
      this.pipelineCache = undefined
      this.sourceWhereClausesCache = undefined

      // Reset lazy source alias state
      this.lazySources.clear()
      this.optimizableOrderByCollections = {}
      this.lazySourcesCallbacks = {}

      // Clear subscription references to prevent memory leaks
      // Note: Individual subscriptions are already unsubscribed via unsubscribeCallbacks
      Object.keys(this.subscriptions).forEach(
        (key) => delete this.subscriptions[key],
      )
      this.compiledAliasToCollectionId = {}

      // Unregister from scheduler's onClear listener to prevent memory leaks
      // The scheduler's listener Set would otherwise keep a strong reference to this builder
      this.unsubscribeFromSchedulerClears?.()
      this.unsubscribeFromSchedulerClears = undefined
    }
  }

  /**
   * Compiles the query pipeline with all declared aliases.
   */
  private compileBasePipeline() {
    this.graphCache = new D2()
    this.inputsCache = Object.fromEntries(
      Object.keys(this.collectionByAlias).map((alias) => [
        alias,
        this.graphCache!.newInput<any>(),
      ]),
    )

    const compilation = compileQuery(
      this.query,
      this.inputsCache as Record<string, KeyedStream>,
      this.collections,
      this.subscriptions,
      this.lazySourcesCallbacks,
      this.lazySources,
      this.optimizableOrderByCollections,
      (windowFn: (options: WindowOptions) => void) => {
        this.windowFn = windowFn
      },
    )

    this.pipelineCache = compilation.pipeline
    this.sourceWhereClausesCache = compilation.sourceWhereClauses
    this.compiledAliasToCollectionId = compilation.aliasToCollectionId

    // Defensive check: verify all compiled aliases have corresponding inputs
    // This should never happen since all aliases come from user declarations,
    // but catch it early if the assumption is violated in the future.
    const missingAliases = Object.keys(this.compiledAliasToCollectionId).filter(
      (alias) => !Object.hasOwn(this.inputsCache!, alias),
    )
    if (missingAliases.length > 0) {
      throw new MissingAliasInputsError(missingAliases)
    }
  }

  private maybeCompileBasePipeline() {
    if (!this.graphCache || !this.inputsCache || !this.pipelineCache) {
      this.compileBasePipeline()
    }
    return {
      graph: this.graphCache!,
      inputs: this.inputsCache!,
      pipeline: this.pipelineCache!,
    }
  }

  private extendPipelineWithChangeProcessing(
    config: SyncMethods<TResult>,
    syncState: SyncState,
  ): FullSyncState {
    const { begin, commit } = config
    const { graph, inputs, pipeline } = this.maybeCompileBasePipeline()

    pipeline.pipe(
      output((data) => {
        const messages = data.getInner()
        syncState.messagesCount += messages.length

        begin()
        messages
          .reduce(
            accumulateChanges<TResult>,
            new Map<unknown, Changes<TResult>>(),
          )
          .forEach(this.applyChanges.bind(this, config))
        commit()
      }),
    )

    graph.finalize()

    // Extend the sync state with the graph, inputs, and pipeline
    syncState.graph = graph
    syncState.inputs = inputs
    syncState.pipeline = pipeline

    return syncState as FullSyncState
  }

  private applyChanges(
    config: SyncMethods<TResult>,
    changes: {
      deletes: number
      inserts: number
      value: TResult
      orderByIndex: string | undefined
    },
    key: unknown,
  ) {
    const { write, collection } = config
    const { deletes, inserts, value, orderByIndex } = changes

    // Store the key of the result so that we can retrieve it in the
    // getKey function
    this.resultKeys.set(value, key)

    // Store the orderBy index if it exists
    if (orderByIndex !== undefined) {
      this.orderByIndices.set(value, orderByIndex)
    }

    // Simple singular insert.
    if (inserts && deletes === 0) {
      write({
        value,
        type: `insert`,
      })
    } else if (
      // Insert & update(s) (updates are a delete & insert)
      inserts > deletes ||
      // Just update(s) but the item is already in the collection (so
      // was inserted previously).
      (inserts === deletes && collection.has(collection.getKeyFromItem(value)))
    ) {
      write({
        value,
        type: `update`,
      })
      // Only delete is left as an option
    } else if (deletes > 0) {
      write({
        value,
        type: `delete`,
      })
    } else {
      throw new Error(
        `Could not apply changes: ${JSON.stringify(changes)}. This should never happen.`,
      )
    }
  }

  /**
   * Handle status changes from source collections
   */
  private handleSourceStatusChange(
    config: SyncMethods<TResult>,
    collectionId: string,
    event: AllCollectionEvents[`status:change`],
  ) {
    const { status } = event

    // Handle error state - any source collection in error puts live query in error
    if (status === `error`) {
      this.transitionToError(
        `Source collection '${collectionId}' entered error state`,
      )
      return
    }

    // Handle manual cleanup - this should not happen due to GC prevention,
    // but could happen if user manually calls cleanup()
    if (status === `cleaned-up`) {
      this.transitionToError(
        `Source collection '${collectionId}' was manually cleaned up while live query '${this.id}' depends on it. ` +
          `Live queries prevent automatic GC, so this was likely a manual cleanup() call.`,
      )
      return
    }

    // Update ready status based on all source collections
    this.updateLiveQueryStatus(config)
  }

  /**
   * Update the live query status based on source collection statuses
   */
  private updateLiveQueryStatus(config: SyncMethods<TResult>) {
    const { markReady } = config

    // Don't update status if already in error
    if (this.isInErrorState) {
      return
    }

    // Mark ready when all source collections are ready
    if (this.allCollectionsReady()) {
      markReady()
    }
  }

  /**
   * Transition the live query to error state
   */
  private transitionToError(message: string) {
    this.isInErrorState = true

    // Log error to console for debugging
    console.error(`[Live Query Error] ${message}`)

    // Transition live query collection to error state
    this.liveQueryCollection?._lifecycle.setStatus(`error`)
  }

  private allCollectionsReady() {
    return Object.values(this.collections).every((collection) =>
      collection.isReady(),
    )
  }

  /**
   * Creates per-alias subscriptions enabling self-join support.
   * Each alias gets its own subscription with independent filters, even for the same collection.
   * Example: `{ employee: col, manager: col }` creates two separate subscriptions.
   */
  private subscribeToAllCollections(
    config: SyncMethods<TResult>,
    syncState: FullSyncState,
  ) {
    // Use compiled aliases as the source of truth - these include all aliases from the query
    // including those from subqueries, which may not be in collectionByAlias
    const compiledAliases = Object.entries(this.compiledAliasToCollectionId)
    if (compiledAliases.length === 0) {
      throw new Error(
        `Compiler returned no alias metadata for query '${this.id}'. This should not happen; please report.`,
      )
    }

    // Create a separate subscription for each alias, enabling self-joins where the same
    // collection can be used multiple times with different filters and subscriptions
    const loaders = compiledAliases.map(([alias, collectionId]) => {
      // Try collectionByAlias first (for declared aliases), fall back to collections (for subquery aliases)
      const collection =
        this.collectionByAlias[alias] ?? this.collections[collectionId]!

      const dependencyBuilder = getCollectionBuilder(collection)
      if (dependencyBuilder && dependencyBuilder !== this) {
        this.aliasDependencies[alias] = [dependencyBuilder]
        this.builderDependencies.add(dependencyBuilder)
      } else {
        this.aliasDependencies[alias] = []
      }

      // CollectionSubscriber handles the actual subscription to the source collection
      // and feeds data into the D2 graph inputs for this specific alias
      const collectionSubscriber = new CollectionSubscriber(
        alias,
        collectionId,
        collection,
        this,
      )

      // Subscribe to status changes for status flow
      const statusUnsubscribe = collection.on(`status:change`, (event) => {
        this.handleSourceStatusChange(config, collectionId, event)
      })
      syncState.unsubscribeCallbacks.add(statusUnsubscribe)

      const subscription = collectionSubscriber.subscribe()
      // Store subscription by alias (not collection ID) to support lazy loading
      // which needs to look up subscriptions by their query alias
      this.subscriptions[alias] = subscription

      // Create a callback for loading more data if needed (used by OrderBy optimization)
      const loadMore = collectionSubscriber.loadMoreIfNeeded.bind(
        collectionSubscriber,
        subscription,
      )

      return loadMore
    })

    // Combine all loaders into a single callback that initiates loading more data
    // from any source that needs it. Returns true once all loaders have been called,
    // but the actual async loading may still be in progress.
    const loadSubsetDataCallbacks = () => {
      loaders.map((loader) => loader())
      return true
    }

    // Mark as subscribed so the graph can start running
    // (graph only runs when all collections are subscribed)
    syncState.subscribedToAllCollections = true

    // Initial status check after all subscriptions are set up
    this.updateLiveQueryStatus(config)

    return loadSubsetDataCallbacks
  }
}

function buildQueryFromConfig<TContext extends Context>(
  config: LiveQueryCollectionConfig<any, any>,
) {
  // Build the query using the provided query builder function or instance
  if (typeof config.query === `function`) {
    return buildQuery<TContext>(config.query)
  }
  return getQueryIR(config.query)
}

function createOrderByComparator<T extends object>(
  orderByIndices: WeakMap<object, string>,
) {
  return (val1: T, val2: T): number => {
    // Use the orderBy index stored in the WeakMap
    const index1 = orderByIndices.get(val1)
    const index2 = orderByIndices.get(val2)

    // Compare fractional indices lexicographically
    if (index1 && index2) {
      if (index1 < index2) {
        return -1
      } else if (index1 > index2) {
        return 1
      } else {
        return 0
      }
    }

    // Fallback to no ordering if indices are missing
    return 0
  }
}

/**
 * Helper function to extract collections from a compiled query
 * Traverses the query IR to find all collection references
 * Maps collections by their ID (not alias) as expected by the compiler
 */
function extractCollectionsFromQuery(
  query: any,
): Record<string, Collection<any, any, any>> {
  const collections: Record<string, any> = {}

  // Helper function to recursively extract collections from a query or source
  function extractFromSource(source: any) {
    if (source.type === `collectionRef`) {
      collections[source.collection.id] = source.collection
    } else if (source.type === `queryRef`) {
      // Recursively extract from subquery
      extractFromQuery(source.query)
    }
  }

  // Helper function to recursively extract collections from a query
  function extractFromQuery(q: any) {
    // Extract from FROM clause
    if (q.from) {
      extractFromSource(q.from)
    }

    // Extract from JOIN clauses
    if (q.join && Array.isArray(q.join)) {
      for (const joinClause of q.join) {
        if (joinClause.from) {
          extractFromSource(joinClause.from)
        }
      }
    }
  }

  // Start extraction from the root query
  extractFromQuery(query)

  return collections
}

/**
 * Helper function to extract the collection that is referenced in the query's FROM clause.
 * The FROM clause may refer directly to a collection or indirectly to a subquery.
 */
function extractCollectionFromSource(query: any): Collection<any, any, any> {
  const from = query.from

  if (from.type === `collectionRef`) {
    return from.collection
  } else if (from.type === `queryRef`) {
    // Recursively extract from subquery
    return extractCollectionFromSource(from.query)
  }

  throw new Error(
    `Failed to extract collection. Invalid FROM clause: ${JSON.stringify(query)}`,
  )
}

/**
 * Extracts all aliases used for each collection across the entire query tree.
 *
 * Traverses the QueryIR recursively to build a map from collection ID to all aliases
 * that reference that collection. This is essential for self-join support, where the
 * same collection may be referenced multiple times with different aliases.
 *
 * For example, given a query like:
 * ```ts
 * q.from({ employee: employeesCollection })
 *   .join({ manager: employeesCollection }, ({ employee, manager }) =>
 *     eq(employee.managerId, manager.id)
 *   )
 * ```
 *
 * This function would return:
 * ```
 * Map { "employees" => Set { "employee", "manager" } }
 * ```
 *
 * @param query - The query IR to extract aliases from
 * @returns A map from collection ID to the set of all aliases referencing that collection
 */
function extractCollectionAliases(query: QueryIR): Map<string, Set<string>> {
  const aliasesById = new Map<string, Set<string>>()

  function recordAlias(source: any) {
    if (!source) return

    if (source.type === `collectionRef`) {
      const { id } = source.collection
      const existing = aliasesById.get(id)
      if (existing) {
        existing.add(source.alias)
      } else {
        aliasesById.set(id, new Set([source.alias]))
      }
    } else if (source.type === `queryRef`) {
      traverse(source.query)
    }
  }

  function traverse(q?: QueryIR) {
    if (!q) return

    recordAlias(q.from)

    if (q.join) {
      for (const joinClause of q.join) {
        recordAlias(joinClause.from)
      }
    }
  }

  traverse(query)

  return aliasesById
}

function accumulateChanges<T>(
  acc: Map<unknown, Changes<T>>,
  [[key, tupleData], multiplicity]: [
    [unknown, [any, string | undefined]],
    number,
  ],
) {
  // All queries now consistently return [value, orderByIndex] format
  // where orderByIndex is undefined for queries without ORDER BY
  const [value, orderByIndex] = tupleData as [T, string | undefined]

  const changes = acc.get(key) || {
    deletes: 0,
    inserts: 0,
    value,
    orderByIndex,
  }
  if (multiplicity < 0) {
    changes.deletes += Math.abs(multiplicity)
  } else if (multiplicity > 0) {
    changes.inserts += multiplicity
    changes.value = value
    changes.orderByIndex = orderByIndex
  }
  acc.set(key, changes)
  return acc
}
