import { D2, output } from "@tanstack/db-ivm";
import { compileQuery } from "../compiler/index.js";
import { buildQuery, getQueryIR } from "../builder/index.js";
import { SetWindowRequiresOrderByError, MissingAliasInputsError } from "../../errors.js";
import { transactionScopedScheduler } from "../../scheduler.js";
import { getActiveTransaction } from "../../transactions.js";
import { CollectionSubscriber } from "./collection-subscriber.js";
import { getCollectionBuilder } from "./collection-registry.js";
import { LIVE_QUERY_INTERNAL } from "./internal.js";
let liveQueryCollectionCounter = 0;
class CollectionConfigBuilder {
  constructor(config) {
    this.config = config;
    this.compiledAliasToCollectionId = {};
    this.resultKeys = /* @__PURE__ */ new WeakMap();
    this.orderByIndices = /* @__PURE__ */ new WeakMap();
    this.isGraphRunning = false;
    this.runCount = 0;
    this.isInErrorState = false;
    this.aliasDependencies = {};
    this.builderDependencies = /* @__PURE__ */ new Set();
    this.pendingGraphRuns = /* @__PURE__ */ new Map();
    this.subscriptions = {};
    this.lazySourcesCallbacks = {};
    this.lazySources = /* @__PURE__ */ new Set();
    this.optimizableOrderByCollections = {};
    this.id = config.id || `live-query-${++liveQueryCollectionCounter}`;
    this.query = buildQueryFromConfig(config);
    this.collections = extractCollectionsFromQuery(this.query);
    const collectionAliasesById = extractCollectionAliases(this.query);
    this.collectionByAlias = {};
    for (const [collectionId, aliases] of collectionAliasesById.entries()) {
      const collection = this.collections[collectionId];
      if (!collection) continue;
      for (const alias of aliases) {
        this.collectionByAlias[alias] = collection;
      }
    }
    if (this.query.orderBy && this.query.orderBy.length > 0) {
      this.compare = createOrderByComparator(this.orderByIndices);
    }
    this.compareOptions = this.config.defaultStringCollation ?? extractCollectionFromSource(this.query).compareOptions;
    this.compileBasePipeline();
  }
  /**
   * Recursively checks if a query or any of its subqueries contains joins
   */
  hasJoins(query) {
    if (query.join && query.join.length > 0) {
      return true;
    }
    if (query.from.type === `queryRef`) {
      if (this.hasJoins(query.from.query)) {
        return true;
      }
    }
    return false;
  }
  getConfig() {
    return {
      id: this.id,
      getKey: this.config.getKey || ((item) => this.resultKeys.get(item)),
      sync: this.getSyncConfig(),
      compare: this.compare,
      defaultStringCollation: this.compareOptions,
      gcTime: this.config.gcTime || 5e3,
      // 5 seconds by default for live queries
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
          hasJoins: this.hasJoins(this.query)
        }
      }
    };
  }
  setWindow(options) {
    if (!this.windowFn) {
      throw new SetWindowRequiresOrderByError();
    }
    this.currentWindow = options;
    this.windowFn(options);
    this.maybeRunGraphFn?.();
    if (this.liveQueryCollection?.isLoadingSubset) {
      return new Promise((resolve) => {
        const unsubscribe = this.liveQueryCollection.on(
          `loadingSubset:change`,
          (event) => {
            if (!event.isLoadingSubset) {
              unsubscribe();
              resolve();
            }
          }
        );
      });
    }
    return true;
  }
  getWindow() {
    if (!this.windowFn || !this.currentWindow) {
      return void 0;
    }
    return {
      offset: this.currentWindow.offset ?? 0,
      limit: this.currentWindow.limit ?? 0
    };
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
  getCollectionIdForAlias(alias) {
    const compiled = this.compiledAliasToCollectionId[alias];
    if (compiled) {
      return compiled;
    }
    const collection = this.collectionByAlias[alias];
    if (collection) {
      return collection.id;
    }
    throw new Error(`Unknown source alias "${alias}"`);
  }
  isLazyAlias(alias) {
    return this.lazySources.has(alias);
  }
  // The callback function is called after the graph has run.
  // This gives the callback a chance to load more data if needed,
  // that's used to optimize orderBy operators that set a limit,
  // in order to load some more data if we still don't have enough rows after the pipeline has run.
  // That can happen because even though we load N rows, the pipeline might filter some of these rows out
  // causing the orderBy operator to receive less than N rows or even no rows at all.
  // So this callback would notice that it doesn't have enough rows and load some more.
  // The callback returns a boolean, when it's true it's done loading data and we can mark the collection as ready.
  maybeRunGraph(callback) {
    if (this.isGraphRunning) {
      return;
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `maybeRunGraph called without active sync session. This should not happen.`
      );
    }
    this.isGraphRunning = true;
    try {
      const { begin, commit } = this.currentSyncConfig;
      const syncState = this.currentSyncState;
      if (this.isInErrorState) {
        return;
      }
      if (syncState.subscribedToAllCollections) {
        while (syncState.graph.pendingWork()) {
          syncState.graph.run();
          callback?.();
        }
        if (syncState.messagesCount === 0) {
          begin();
          commit();
          this.updateLiveQueryStatus(this.currentSyncConfig);
        }
      }
    } finally {
      this.isGraphRunning = false;
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
  scheduleGraphRun(callback, options) {
    const contextId = options?.contextId ?? getActiveTransaction()?.id;
    const jobId = options?.jobId ?? this;
    const dependentBuilders = (() => {
      if (options?.dependencies) {
        return options.dependencies;
      }
      const deps = new Set(this.builderDependencies);
      if (options?.alias) {
        const aliasDeps = this.aliasDependencies[options.alias];
        if (aliasDeps) {
          for (const dep of aliasDeps) {
            deps.add(dep);
          }
        }
      }
      deps.delete(this);
      return Array.from(deps);
    })();
    if (contextId) {
      for (const dep of dependentBuilders) {
        if (typeof dep.scheduleGraphRun === `function`) {
          dep.scheduleGraphRun(void 0, { contextId });
        }
      }
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `scheduleGraphRun called without active sync session. This should not happen.`
      );
    }
    let pending = contextId ? this.pendingGraphRuns.get(contextId) : void 0;
    if (!pending) {
      pending = {
        loadCallbacks: /* @__PURE__ */ new Set()
      };
      if (contextId) {
        this.pendingGraphRuns.set(contextId, pending);
      }
    }
    if (callback) {
      pending.loadCallbacks.add(callback);
    }
    const pendingToPass = contextId ? void 0 : pending;
    transactionScopedScheduler.schedule({
      contextId,
      jobId,
      dependencies: dependentBuilders,
      run: () => this.executeGraphRun(contextId, pendingToPass)
    });
  }
  /**
   * Clears pending graph run state for a specific context.
   * Called when the scheduler clears a context (e.g., transaction rollback/abort).
   */
  clearPendingGraphRun(contextId) {
    this.pendingGraphRuns.delete(contextId);
  }
  /**
   * Returns true if this builder has a pending graph run for the given context.
   */
  hasPendingGraphRun(contextId) {
    return this.pendingGraphRuns.has(contextId);
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
  executeGraphRun(contextId, pendingParam) {
    const pending = pendingParam ?? (contextId ? this.pendingGraphRuns.get(contextId) : void 0);
    if (contextId) {
      this.pendingGraphRuns.delete(contextId);
    }
    if (!pending) {
      return;
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      return;
    }
    this.incrementRunCount();
    const combinedLoader = () => {
      let allDone = true;
      let firstError;
      pending.loadCallbacks.forEach((loader) => {
        try {
          allDone = loader() && allDone;
        } catch (error) {
          allDone = false;
          firstError ??= error;
        }
      });
      if (firstError) {
        throw firstError;
      }
      return allDone;
    };
    this.maybeRunGraph(combinedLoader);
  }
  getSyncConfig() {
    return {
      rowUpdateMode: `full`,
      sync: this.syncFn.bind(this)
    };
  }
  incrementRunCount() {
    this.runCount++;
  }
  getRunCount() {
    return this.runCount;
  }
  syncFn(config) {
    this.liveQueryCollection = config.collection;
    this.currentSyncConfig = config;
    const syncState = {
      messagesCount: 0,
      subscribedToAllCollections: false,
      unsubscribeCallbacks: /* @__PURE__ */ new Set()
    };
    const fullSyncState = this.extendPipelineWithChangeProcessing(
      config,
      syncState
    );
    this.currentSyncState = fullSyncState;
    this.unsubscribeFromSchedulerClears = transactionScopedScheduler.onClear(
      (contextId) => {
        this.clearPendingGraphRun(contextId);
      }
    );
    const loadSubsetDataCallbacks = this.subscribeToAllCollections(
      config,
      fullSyncState
    );
    this.maybeRunGraphFn = () => this.scheduleGraphRun(loadSubsetDataCallbacks);
    this.scheduleGraphRun(loadSubsetDataCallbacks);
    return () => {
      syncState.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
      this.currentSyncConfig = void 0;
      this.currentSyncState = void 0;
      this.pendingGraphRuns.clear();
      this.graphCache = void 0;
      this.inputsCache = void 0;
      this.pipelineCache = void 0;
      this.sourceWhereClausesCache = void 0;
      this.lazySources.clear();
      this.optimizableOrderByCollections = {};
      this.lazySourcesCallbacks = {};
      Object.keys(this.subscriptions).forEach(
        (key) => delete this.subscriptions[key]
      );
      this.compiledAliasToCollectionId = {};
      this.unsubscribeFromSchedulerClears?.();
      this.unsubscribeFromSchedulerClears = void 0;
    };
  }
  /**
   * Compiles the query pipeline with all declared aliases.
   */
  compileBasePipeline() {
    this.graphCache = new D2();
    this.inputsCache = Object.fromEntries(
      Object.keys(this.collectionByAlias).map((alias) => [
        alias,
        this.graphCache.newInput()
      ])
    );
    const compilation = compileQuery(
      this.query,
      this.inputsCache,
      this.collections,
      this.subscriptions,
      this.lazySourcesCallbacks,
      this.lazySources,
      this.optimizableOrderByCollections,
      (windowFn) => {
        this.windowFn = windowFn;
      }
    );
    this.pipelineCache = compilation.pipeline;
    this.sourceWhereClausesCache = compilation.sourceWhereClauses;
    this.compiledAliasToCollectionId = compilation.aliasToCollectionId;
    const missingAliases = Object.keys(this.compiledAliasToCollectionId).filter(
      (alias) => !Object.hasOwn(this.inputsCache, alias)
    );
    if (missingAliases.length > 0) {
      throw new MissingAliasInputsError(missingAliases);
    }
  }
  maybeCompileBasePipeline() {
    if (!this.graphCache || !this.inputsCache || !this.pipelineCache) {
      this.compileBasePipeline();
    }
    return {
      graph: this.graphCache,
      inputs: this.inputsCache,
      pipeline: this.pipelineCache
    };
  }
  extendPipelineWithChangeProcessing(config, syncState) {
    const { begin, commit } = config;
    const { graph, inputs, pipeline } = this.maybeCompileBasePipeline();
    pipeline.pipe(
      output((data) => {
        const messages = data.getInner();
        syncState.messagesCount += messages.length;
        begin();
        messages.reduce(
          accumulateChanges,
          /* @__PURE__ */ new Map()
        ).forEach(this.applyChanges.bind(this, config));
        commit();
      })
    );
    graph.finalize();
    syncState.graph = graph;
    syncState.inputs = inputs;
    syncState.pipeline = pipeline;
    return syncState;
  }
  applyChanges(config, changes, key) {
    const { write, collection } = config;
    const { deletes, inserts, value, orderByIndex } = changes;
    this.resultKeys.set(value, key);
    if (orderByIndex !== void 0) {
      this.orderByIndices.set(value, orderByIndex);
    }
    if (inserts && deletes === 0) {
      write({
        value,
        type: `insert`
      });
    } else if (
      // Insert & update(s) (updates are a delete & insert)
      inserts > deletes || // Just update(s) but the item is already in the collection (so
      // was inserted previously).
      inserts === deletes && collection.has(collection.getKeyFromItem(value))
    ) {
      write({
        value,
        type: `update`
      });
    } else if (deletes > 0) {
      write({
        value,
        type: `delete`
      });
    } else {
      throw new Error(
        `Could not apply changes: ${JSON.stringify(changes)}. This should never happen.`
      );
    }
  }
  /**
   * Handle status changes from source collections
   */
  handleSourceStatusChange(config, collectionId, event) {
    const { status } = event;
    if (status === `error`) {
      this.transitionToError(
        `Source collection '${collectionId}' entered error state`
      );
      return;
    }
    if (status === `cleaned-up`) {
      this.transitionToError(
        `Source collection '${collectionId}' was manually cleaned up while live query '${this.id}' depends on it. Live queries prevent automatic GC, so this was likely a manual cleanup() call.`
      );
      return;
    }
    this.updateLiveQueryStatus(config);
  }
  /**
   * Update the live query status based on source collection statuses
   */
  updateLiveQueryStatus(config) {
    const { markReady } = config;
    if (this.isInErrorState) {
      return;
    }
    if (this.allCollectionsReady()) {
      markReady();
    }
  }
  /**
   * Transition the live query to error state
   */
  transitionToError(message) {
    this.isInErrorState = true;
    console.error(`[Live Query Error] ${message}`);
    this.liveQueryCollection?._lifecycle.setStatus(`error`);
  }
  allCollectionsReady() {
    return Object.values(this.collections).every(
      (collection) => collection.isReady()
    );
  }
  /**
   * Creates per-alias subscriptions enabling self-join support.
   * Each alias gets its own subscription with independent filters, even for the same collection.
   * Example: `{ employee: col, manager: col }` creates two separate subscriptions.
   */
  subscribeToAllCollections(config, syncState) {
    const compiledAliases = Object.entries(this.compiledAliasToCollectionId);
    if (compiledAliases.length === 0) {
      throw new Error(
        `Compiler returned no alias metadata for query '${this.id}'. This should not happen; please report.`
      );
    }
    const loaders = compiledAliases.map(([alias, collectionId]) => {
      const collection = this.collectionByAlias[alias] ?? this.collections[collectionId];
      const dependencyBuilder = getCollectionBuilder(collection);
      if (dependencyBuilder && dependencyBuilder !== this) {
        this.aliasDependencies[alias] = [dependencyBuilder];
        this.builderDependencies.add(dependencyBuilder);
      } else {
        this.aliasDependencies[alias] = [];
      }
      const collectionSubscriber = new CollectionSubscriber(
        alias,
        collectionId,
        collection,
        this
      );
      const statusUnsubscribe = collection.on(`status:change`, (event) => {
        this.handleSourceStatusChange(config, collectionId, event);
      });
      syncState.unsubscribeCallbacks.add(statusUnsubscribe);
      const subscription = collectionSubscriber.subscribe();
      this.subscriptions[alias] = subscription;
      const loadMore = collectionSubscriber.loadMoreIfNeeded.bind(
        collectionSubscriber,
        subscription
      );
      return loadMore;
    });
    const loadSubsetDataCallbacks = () => {
      loaders.map((loader) => loader());
      return true;
    };
    syncState.subscribedToAllCollections = true;
    this.updateLiveQueryStatus(config);
    return loadSubsetDataCallbacks;
  }
}
function buildQueryFromConfig(config) {
  if (typeof config.query === `function`) {
    return buildQuery(config.query);
  }
  return getQueryIR(config.query);
}
function createOrderByComparator(orderByIndices) {
  return (val1, val2) => {
    const index1 = orderByIndices.get(val1);
    const index2 = orderByIndices.get(val2);
    if (index1 && index2) {
      if (index1 < index2) {
        return -1;
      } else if (index1 > index2) {
        return 1;
      } else {
        return 0;
      }
    }
    return 0;
  };
}
function extractCollectionsFromQuery(query) {
  const collections = {};
  function extractFromSource(source) {
    if (source.type === `collectionRef`) {
      collections[source.collection.id] = source.collection;
    } else if (source.type === `queryRef`) {
      extractFromQuery(source.query);
    }
  }
  function extractFromQuery(q) {
    if (q.from) {
      extractFromSource(q.from);
    }
    if (q.join && Array.isArray(q.join)) {
      for (const joinClause of q.join) {
        if (joinClause.from) {
          extractFromSource(joinClause.from);
        }
      }
    }
  }
  extractFromQuery(query);
  return collections;
}
function extractCollectionFromSource(query) {
  const from = query.from;
  if (from.type === `collectionRef`) {
    return from.collection;
  } else if (from.type === `queryRef`) {
    return extractCollectionFromSource(from.query);
  }
  throw new Error(
    `Failed to extract collection. Invalid FROM clause: ${JSON.stringify(query)}`
  );
}
function extractCollectionAliases(query) {
  const aliasesById = /* @__PURE__ */ new Map();
  function recordAlias(source) {
    if (!source) return;
    if (source.type === `collectionRef`) {
      const { id } = source.collection;
      const existing = aliasesById.get(id);
      if (existing) {
        existing.add(source.alias);
      } else {
        aliasesById.set(id, /* @__PURE__ */ new Set([source.alias]));
      }
    } else if (source.type === `queryRef`) {
      traverse(source.query);
    }
  }
  function traverse(q) {
    if (!q) return;
    recordAlias(q.from);
    if (q.join) {
      for (const joinClause of q.join) {
        recordAlias(joinClause.from);
      }
    }
  }
  traverse(query);
  return aliasesById;
}
function accumulateChanges(acc, [[key, tupleData], multiplicity]) {
  const [value, orderByIndex] = tupleData;
  const changes = acc.get(key) || {
    deletes: 0,
    inserts: 0,
    value,
    orderByIndex
  };
  if (multiplicity < 0) {
    changes.deletes += Math.abs(multiplicity);
  } else if (multiplicity > 0) {
    changes.inserts += multiplicity;
    changes.value = value;
    changes.orderByIndex = orderByIndex;
  }
  acc.set(key, changes);
  return acc;
}
export {
  CollectionConfigBuilder
};
//# sourceMappingURL=collection-config-builder.js.map
