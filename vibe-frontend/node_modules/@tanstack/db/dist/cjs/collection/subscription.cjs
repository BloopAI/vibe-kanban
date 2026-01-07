"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const autoIndex = require("../indexes/auto-index.cjs");
const functions = require("../query/builder/functions.cjs");
const ir = require("../query/ir.cjs");
const eventEmitter = require("../event-emitter.cjs");
const evaluators = require("../query/compiler/evaluators.cjs");
const cursor = require("../utils/cursor.cjs");
const changeEvents = require("./change-events.cjs");
class CollectionSubscription extends eventEmitter.EventEmitter {
  constructor(collection, callback, options) {
    super();
    this.collection = collection;
    this.callback = callback;
    this.options = options;
    this.loadedInitialState = false;
    this.skipFiltering = false;
    this.snapshotSent = false;
    this.loadedSubsets = [];
    this.sentKeys = /* @__PURE__ */ new Set();
    this.limitedSnapshotRowCount = 0;
    this._status = `ready`;
    this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
    this.isBufferingForTruncate = false;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches = /* @__PURE__ */ new Set();
    if (options.onUnsubscribe) {
      this.on(`unsubscribed`, (event) => options.onUnsubscribe(event));
    }
    if (options.whereExpression) {
      autoIndex.ensureIndexForExpression(options.whereExpression, this.collection);
    }
    const callbackWithSentKeysTracking = (changes) => {
      callback(changes);
      this.trackSentKeys(changes);
    };
    this.callback = callbackWithSentKeysTracking;
    this.filteredCallback = options.whereExpression ? changeEvents.createFilteredCallback(this.callback, options) : this.callback;
    this.truncateCleanup = this.collection.on(`truncate`, () => {
      this.handleTruncate();
    });
  }
  get status() {
    return this._status;
  }
  /**
   * Handle collection truncate event by resetting state and re-requesting subsets.
   * This is called when the sync layer receives a must-refetch and clears all data.
   *
   * To prevent a flash of missing content, we buffer all changes (deletes from truncate
   * and inserts from refetch) until all loadSubset promises resolve, then emit them together.
   */
  handleTruncate() {
    const subsetsToReload = [...this.loadedSubsets];
    const hasLoadSubsetHandler = this.collection._sync.syncLoadSubsetFn !== null;
    if (subsetsToReload.length === 0 || !hasLoadSubsetHandler) {
      this.snapshotSent = false;
      this.loadedInitialState = false;
      this.limitedSnapshotRowCount = 0;
      this.lastSentKey = void 0;
      this.loadedSubsets = [];
      return;
    }
    this.isBufferingForTruncate = true;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches.clear();
    this.snapshotSent = false;
    this.loadedInitialState = false;
    this.limitedSnapshotRowCount = 0;
    this.lastSentKey = void 0;
    this.loadedSubsets = [];
    queueMicrotask(() => {
      if (!this.isBufferingForTruncate) {
        return;
      }
      for (const options of subsetsToReload) {
        const syncResult = this.collection._sync.loadSubset(options);
        this.loadedSubsets.push(options);
        this.trackLoadSubsetPromise(syncResult);
        if (syncResult instanceof Promise) {
          this.pendingTruncateRefetches.add(syncResult);
          syncResult.catch(() => {
          }).finally(() => {
            this.pendingTruncateRefetches.delete(syncResult);
            this.checkTruncateRefetchComplete();
          });
        }
      }
      if (this.pendingTruncateRefetches.size === 0) {
        this.flushTruncateBuffer();
      }
    });
  }
  /**
   * Check if all truncate refetch promises have completed and flush buffer if so
   */
  checkTruncateRefetchComplete() {
    if (this.pendingTruncateRefetches.size === 0 && this.isBufferingForTruncate) {
      this.flushTruncateBuffer();
    }
  }
  /**
   * Flush the truncate buffer, emitting all buffered changes to the callback
   */
  flushTruncateBuffer() {
    this.isBufferingForTruncate = false;
    const merged = this.truncateBuffer.flat();
    if (merged.length > 0) {
      this.filteredCallback(merged);
    }
    this.truncateBuffer = [];
  }
  setOrderByIndex(index) {
    this.orderByIndex = index;
  }
  /**
   * Set subscription status and emit events if changed
   */
  setStatus(newStatus) {
    if (this._status === newStatus) {
      return;
    }
    const previousStatus = this._status;
    this._status = newStatus;
    this.emitInner(`status:change`, {
      type: `status:change`,
      subscription: this,
      previousStatus,
      status: newStatus
    });
    const eventKey = `status:${newStatus}`;
    this.emitInner(eventKey, {
      type: eventKey,
      subscription: this,
      previousStatus,
      status: newStatus
    });
  }
  /**
   * Track a loadSubset promise and manage loading status
   */
  trackLoadSubsetPromise(syncResult) {
    if (syncResult instanceof Promise) {
      this.pendingLoadSubsetPromises.add(syncResult);
      this.setStatus(`loadingSubset`);
      syncResult.finally(() => {
        this.pendingLoadSubsetPromises.delete(syncResult);
        if (this.pendingLoadSubsetPromises.size === 0) {
          this.setStatus(`ready`);
        }
      });
    }
  }
  hasLoadedInitialState() {
    return this.loadedInitialState;
  }
  hasSentAtLeastOneSnapshot() {
    return this.snapshotSent;
  }
  emitEvents(changes) {
    const newChanges = this.filterAndFlipChanges(changes);
    if (this.isBufferingForTruncate) {
      if (newChanges.length > 0) {
        this.truncateBuffer.push(newChanges);
      }
    } else {
      this.filteredCallback(newChanges);
    }
  }
  /**
   * Sends the snapshot to the callback.
   * Returns a boolean indicating if it succeeded.
   * It can only fail if there is no index to fulfill the request
   * and the optimizedOnly option is set to true,
   * or, the entire state was already loaded.
   */
  requestSnapshot(opts) {
    if (this.loadedInitialState) {
      return false;
    }
    const stateOpts = {
      where: this.options.whereExpression,
      optimizedOnly: opts?.optimizedOnly ?? false
    };
    if (opts) {
      if (`where` in opts) {
        const snapshotWhereExp = opts.where;
        if (stateOpts.where) {
          const subWhereExp = stateOpts.where;
          const combinedWhereExp = functions.and(subWhereExp, snapshotWhereExp);
          stateOpts.where = combinedWhereExp;
        } else {
          stateOpts.where = snapshotWhereExp;
        }
      }
    } else {
      this.loadedInitialState = true;
    }
    const loadOptions = {
      where: stateOpts.where,
      subscription: this,
      // Include orderBy and limit if provided so sync layer can optimize the query
      orderBy: opts?.orderBy,
      limit: opts?.limit
    };
    const syncResult = this.collection._sync.loadSubset(loadOptions);
    this.loadedSubsets.push(loadOptions);
    const trackLoadSubsetPromise = opts?.trackLoadSubsetPromise ?? true;
    if (trackLoadSubsetPromise) {
      this.trackLoadSubsetPromise(syncResult);
    }
    const snapshot = this.collection.currentStateAsChanges(stateOpts);
    if (snapshot === void 0) {
      return false;
    }
    const filteredSnapshot = snapshot.filter(
      (change) => !this.sentKeys.has(change.key)
    );
    for (const change of filteredSnapshot) {
      this.sentKeys.add(change.key);
    }
    this.snapshotSent = true;
    this.callback(filteredSnapshot);
    return true;
  }
  /**
   * Sends a snapshot that fulfills the `where` clause and all rows are bigger or equal to the cursor.
   * Requires a range index to be set with `setOrderByIndex` prior to calling this method.
   * It uses that range index to load the items in the order of the index.
   *
   * For multi-column orderBy:
   * - Uses first value from `minValues` for LOCAL index operations (wide bounds, ensures no missed rows)
   * - Uses all `minValues` to build a precise composite cursor for SYNC layer loadSubset
   *
   * Note 1: it may load more rows than the provided LIMIT because it loads all values equal to the first cursor value + limit values greater.
   *         This is needed to ensure that it does not accidentally skip duplicate values when the limit falls in the middle of some duplicated values.
   * Note 2: it does not send keys that have already been sent before.
   */
  requestLimitedSnapshot({
    orderBy,
    limit,
    minValues,
    offset
  }) {
    if (!limit) throw new Error(`limit is required`);
    if (!this.orderByIndex) {
      throw new Error(
        `Ordered snapshot was requested but no index was found. You have to call setOrderByIndex before requesting an ordered snapshot.`
      );
    }
    const minValue = minValues?.[0];
    const minValueForIndex = minValue;
    const index = this.orderByIndex;
    const where = this.options.whereExpression;
    const whereFilterFn = where ? changeEvents.createFilterFunctionFromExpression(where) : void 0;
    const filterFn = (key) => {
      if (this.sentKeys.has(key)) {
        return false;
      }
      const value = this.collection.get(key);
      if (value === void 0) {
        return false;
      }
      return whereFilterFn?.(value) ?? true;
    };
    let biggestObservedValue = minValueForIndex;
    const changes = [];
    let keys = [];
    if (minValueForIndex !== void 0) {
      const { expression } = orderBy[0];
      const allRowsWithMinValue = this.collection.currentStateAsChanges({
        where: functions.eq(expression, new ir.Value(minValueForIndex))
      });
      if (allRowsWithMinValue) {
        const keysWithMinValue = allRowsWithMinValue.map((change) => change.key).filter((key) => !this.sentKeys.has(key) && filterFn(key));
        keys.push(...keysWithMinValue);
        const keysGreaterThanMin = index.take(
          limit - keys.length,
          minValueForIndex,
          filterFn
        );
        keys.push(...keysGreaterThanMin);
      } else {
        keys = index.take(limit, minValueForIndex, filterFn);
      }
    } else {
      keys = index.take(limit, minValueForIndex, filterFn);
    }
    const valuesNeeded = () => Math.max(limit - changes.length, 0);
    const collectionExhausted = () => keys.length === 0;
    const orderByExpression = orderBy[0].expression;
    const valueExtractor = orderByExpression.type === `ref` ? evaluators.compileExpression(new ir.PropRef(orderByExpression.path), true) : null;
    while (valuesNeeded() > 0 && !collectionExhausted()) {
      const insertedKeys = /* @__PURE__ */ new Set();
      for (const key of keys) {
        const value = this.collection.get(key);
        changes.push({
          type: `insert`,
          key,
          value
        });
        biggestObservedValue = valueExtractor ? valueExtractor(value) : value;
        insertedKeys.add(key);
      }
      keys = index.take(valuesNeeded(), biggestObservedValue, filterFn);
    }
    const currentOffset = this.limitedSnapshotRowCount;
    for (const change of changes) {
      this.sentKeys.add(change.key);
    }
    this.callback(changes);
    this.limitedSnapshotRowCount += changes.length;
    if (changes.length > 0) {
      this.lastSentKey = changes[changes.length - 1].key;
    }
    let cursorExpressions;
    if (minValues !== void 0 && minValues.length > 0) {
      const whereFromCursor = cursor.buildCursor(orderBy, minValues);
      if (whereFromCursor) {
        const { expression } = orderBy[0];
        const minValue2 = minValues[0];
        let whereCurrentCursor;
        if (minValue2 instanceof Date) {
          const minValuePlus1ms = new Date(minValue2.getTime() + 1);
          whereCurrentCursor = functions.and(
            functions.gte(expression, new ir.Value(minValue2)),
            functions.lt(expression, new ir.Value(minValuePlus1ms))
          );
        } else {
          whereCurrentCursor = functions.eq(expression, new ir.Value(minValue2));
        }
        cursorExpressions = {
          whereFrom: whereFromCursor,
          whereCurrent: whereCurrentCursor,
          lastKey: this.lastSentKey
        };
      }
    }
    const loadOptions = {
      where,
      // Main filter only, no cursor
      limit,
      orderBy,
      cursor: cursorExpressions,
      // Cursor expressions passed separately
      offset: offset ?? currentOffset,
      // Use provided offset, or auto-tracked offset
      subscription: this
    };
    const syncResult = this.collection._sync.loadSubset(loadOptions);
    this.loadedSubsets.push(loadOptions);
    this.trackLoadSubsetPromise(syncResult);
  }
  // TODO: also add similar test but that checks that it can also load it from the collection's loadSubset function
  //       and that that also works properly (i.e. does not skip duplicate values)
  /**
   * Filters and flips changes for keys that have not been sent yet.
   * Deletes are filtered out for keys that have not been sent yet.
   * Updates are flipped into inserts for keys that have not been sent yet.
   * Duplicate inserts are filtered out to prevent D2 multiplicity > 1.
   */
  filterAndFlipChanges(changes) {
    if (this.loadedInitialState || this.skipFiltering) {
      return changes;
    }
    const skipDeleteFilter = this.isBufferingForTruncate;
    const newChanges = [];
    for (const change of changes) {
      let newChange = change;
      const keyInSentKeys = this.sentKeys.has(change.key);
      if (!keyInSentKeys) {
        if (change.type === `update`) {
          newChange = { ...change, type: `insert`, previousValue: void 0 };
        } else if (change.type === `delete`) {
          if (!skipDeleteFilter) {
            continue;
          }
        }
        this.sentKeys.add(change.key);
      } else {
        if (change.type === `insert`) {
          continue;
        } else if (change.type === `delete`) {
          this.sentKeys.delete(change.key);
        }
      }
      newChanges.push(newChange);
    }
    return newChanges;
  }
  trackSentKeys(changes) {
    if (this.loadedInitialState || this.skipFiltering) {
      return;
    }
    for (const change of changes) {
      if (change.type === `delete`) {
        this.sentKeys.delete(change.key);
      } else {
        this.sentKeys.add(change.key);
      }
    }
  }
  /**
   * Mark that the subscription should not filter any changes.
   * This is used when includeInitialState is explicitly set to false,
   * meaning the caller doesn't want initial state but does want ALL future changes.
   */
  markAllStateAsSeen() {
    this.skipFiltering = true;
  }
  unsubscribe() {
    this.truncateCleanup?.();
    this.truncateCleanup = void 0;
    this.isBufferingForTruncate = false;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches.clear();
    for (const options of this.loadedSubsets) {
      this.collection._sync.unloadSubset(options);
    }
    this.loadedSubsets = [];
    this.emitInner(`unsubscribed`, {
      type: `unsubscribed`,
      subscription: this
    });
    this.clearListeners();
  }
}
exports.CollectionSubscription = CollectionSubscription;
//# sourceMappingURL=subscription.cjs.map
