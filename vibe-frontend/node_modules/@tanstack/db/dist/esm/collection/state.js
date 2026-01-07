import { deepEquals } from "../utils.js";
import { SortedMap } from "../SortedMap.js";
class CollectionStateManager {
  /**
   * Creates a new CollectionState manager
   */
  constructor(config) {
    this.pendingSyncedTransactions = [];
    this.syncedMetadata = /* @__PURE__ */ new Map();
    this.optimisticUpserts = /* @__PURE__ */ new Map();
    this.optimisticDeletes = /* @__PURE__ */ new Set();
    this.size = 0;
    this.syncedKeys = /* @__PURE__ */ new Set();
    this.preSyncVisibleState = /* @__PURE__ */ new Map();
    this.recentlySyncedKeys = /* @__PURE__ */ new Set();
    this.hasReceivedFirstCommit = false;
    this.isCommittingSyncTransactions = false;
    this.commitPendingTransactions = () => {
      let hasPersistingTransaction = false;
      for (const transaction of this.transactions.values()) {
        if (transaction.state === `persisting`) {
          hasPersistingTransaction = true;
          break;
        }
      }
      const {
        committedSyncedTransactions,
        uncommittedSyncedTransactions,
        hasTruncateSync
      } = this.pendingSyncedTransactions.reduce(
        (acc, t) => {
          if (t.committed) {
            acc.committedSyncedTransactions.push(t);
            if (t.truncate === true) {
              acc.hasTruncateSync = true;
            }
          } else {
            acc.uncommittedSyncedTransactions.push(t);
          }
          return acc;
        },
        {
          committedSyncedTransactions: [],
          uncommittedSyncedTransactions: [],
          hasTruncateSync: false
        }
      );
      if (!hasPersistingTransaction || hasTruncateSync) {
        this.isCommittingSyncTransactions = true;
        const truncateOptimisticSnapshot = hasTruncateSync ? committedSyncedTransactions.find((t) => t.truncate)?.optimisticSnapshot : null;
        const changedKeys = /* @__PURE__ */ new Set();
        for (const transaction of committedSyncedTransactions) {
          for (const operation of transaction.operations) {
            changedKeys.add(operation.key);
          }
        }
        let currentVisibleState = this.preSyncVisibleState;
        if (currentVisibleState.size === 0) {
          currentVisibleState = /* @__PURE__ */ new Map();
          for (const key of changedKeys) {
            const currentValue = this.get(key);
            if (currentValue !== void 0) {
              currentVisibleState.set(key, currentValue);
            }
          }
        }
        const events = [];
        const rowUpdateMode = this.config.sync.rowUpdateMode || `partial`;
        for (const transaction of committedSyncedTransactions) {
          if (transaction.truncate) {
            const visibleKeys = /* @__PURE__ */ new Set([
              ...this.syncedData.keys(),
              ...truncateOptimisticSnapshot?.upserts.keys() || []
            ]);
            for (const key of visibleKeys) {
              if (truncateOptimisticSnapshot?.deletes.has(key)) continue;
              const previousValue = truncateOptimisticSnapshot?.upserts.get(key) || this.syncedData.get(key);
              if (previousValue !== void 0) {
                events.push({ type: `delete`, key, value: previousValue });
              }
            }
            this.syncedData.clear();
            this.syncedMetadata.clear();
            this.syncedKeys.clear();
            for (const key of changedKeys) {
              currentVisibleState.delete(key);
            }
            this._events.emit(`truncate`, {
              type: `truncate`,
              collection: this.collection
            });
          }
          for (const operation of transaction.operations) {
            const key = operation.key;
            this.syncedKeys.add(key);
            switch (operation.type) {
              case `insert`:
                this.syncedMetadata.set(key, operation.metadata);
                break;
              case `update`:
                this.syncedMetadata.set(
                  key,
                  Object.assign(
                    {},
                    this.syncedMetadata.get(key),
                    operation.metadata
                  )
                );
                break;
              case `delete`:
                this.syncedMetadata.delete(key);
                break;
            }
            switch (operation.type) {
              case `insert`:
                this.syncedData.set(key, operation.value);
                break;
              case `update`: {
                if (rowUpdateMode === `partial`) {
                  const updatedValue = Object.assign(
                    {},
                    this.syncedData.get(key),
                    operation.value
                  );
                  this.syncedData.set(key, updatedValue);
                } else {
                  this.syncedData.set(key, operation.value);
                }
                break;
              }
              case `delete`:
                this.syncedData.delete(key);
                break;
            }
          }
        }
        if (hasTruncateSync) {
          const syncedInsertedOrUpdatedKeys = /* @__PURE__ */ new Set();
          for (const t of committedSyncedTransactions) {
            for (const op of t.operations) {
              if (op.type === `insert` || op.type === `update`) {
                syncedInsertedOrUpdatedKeys.add(op.key);
              }
            }
          }
          const reapplyUpserts = new Map(
            truncateOptimisticSnapshot.upserts
          );
          const reapplyDeletes = new Set(
            truncateOptimisticSnapshot.deletes
          );
          for (const [key, value] of reapplyUpserts) {
            if (reapplyDeletes.has(key)) continue;
            if (syncedInsertedOrUpdatedKeys.has(key)) {
              let foundInsert = false;
              for (let i = events.length - 1; i >= 0; i--) {
                const evt = events[i];
                if (evt.key === key && evt.type === `insert`) {
                  evt.value = value;
                  foundInsert = true;
                  break;
                }
              }
              if (!foundInsert) {
                events.push({ type: `insert`, key, value });
              }
            } else {
              events.push({ type: `insert`, key, value });
            }
          }
          if (events.length > 0 && reapplyDeletes.size > 0) {
            const filtered = [];
            for (const evt of events) {
              if (evt.type === `insert` && reapplyDeletes.has(evt.key)) {
                continue;
              }
              filtered.push(evt);
            }
            events.length = 0;
            events.push(...filtered);
          }
          if (this.lifecycle.status !== `ready`) {
            this.lifecycle.markReady();
          }
        }
        this.optimisticUpserts.clear();
        this.optimisticDeletes.clear();
        this.isCommittingSyncTransactions = false;
        if (hasTruncateSync && truncateOptimisticSnapshot) {
          for (const [key, value] of truncateOptimisticSnapshot.upserts) {
            this.optimisticUpserts.set(key, value);
          }
          for (const key of truncateOptimisticSnapshot.deletes) {
            this.optimisticDeletes.add(key);
          }
        }
        for (const transaction of this.transactions.values()) {
          if (![`completed`, `failed`].includes(transaction.state)) {
            for (const mutation of transaction.mutations) {
              if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
                switch (mutation.type) {
                  case `insert`:
                  case `update`:
                    this.optimisticUpserts.set(
                      mutation.key,
                      mutation.modified
                    );
                    this.optimisticDeletes.delete(mutation.key);
                    break;
                  case `delete`:
                    this.optimisticUpserts.delete(mutation.key);
                    this.optimisticDeletes.add(mutation.key);
                    break;
                }
              }
            }
          }
        }
        const completedOptimisticOps = /* @__PURE__ */ new Map();
        for (const transaction of this.transactions.values()) {
          if (transaction.state === `completed`) {
            for (const mutation of transaction.mutations) {
              if (mutation.optimistic && this.isThisCollection(mutation.collection) && changedKeys.has(mutation.key)) {
                completedOptimisticOps.set(mutation.key, {
                  type: mutation.type,
                  value: mutation.modified
                });
              }
            }
          }
        }
        for (const key of changedKeys) {
          const previousVisibleValue = currentVisibleState.get(key);
          const newVisibleValue = this.get(key);
          const completedOp = completedOptimisticOps.get(key);
          let isRedundantSync = false;
          if (completedOp) {
            if (completedOp.type === `delete` && previousVisibleValue !== void 0 && newVisibleValue === void 0 && deepEquals(completedOp.value, previousVisibleValue)) {
              isRedundantSync = true;
            } else if (newVisibleValue !== void 0 && deepEquals(completedOp.value, newVisibleValue)) {
              isRedundantSync = true;
            }
          }
          if (!isRedundantSync) {
            if (previousVisibleValue === void 0 && newVisibleValue !== void 0) {
              events.push({
                type: `insert`,
                key,
                value: newVisibleValue
              });
            } else if (previousVisibleValue !== void 0 && newVisibleValue === void 0) {
              events.push({
                type: `delete`,
                key,
                value: previousVisibleValue
              });
            } else if (previousVisibleValue !== void 0 && newVisibleValue !== void 0 && !deepEquals(previousVisibleValue, newVisibleValue)) {
              events.push({
                type: `update`,
                key,
                value: newVisibleValue,
                previousValue: previousVisibleValue
              });
            }
          }
        }
        this.size = this.calculateSize();
        if (events.length > 0) {
          this.indexes.updateIndexes(events);
        }
        this.changes.emitEvents(events, true);
        this.pendingSyncedTransactions = uncommittedSyncedTransactions;
        this.preSyncVisibleState.clear();
        Promise.resolve().then(() => {
          this.recentlySyncedKeys.clear();
        });
        if (!this.hasReceivedFirstCommit) {
          this.hasReceivedFirstCommit = true;
        }
      }
    };
    this.config = config;
    this.transactions = new SortedMap(
      (a, b) => a.compareCreatedAt(b)
    );
    this.syncedData = new SortedMap(config.compare);
  }
  setDeps(deps) {
    this.collection = deps.collection;
    this.lifecycle = deps.lifecycle;
    this.changes = deps.changes;
    this.indexes = deps.indexes;
    this._events = deps.events;
  }
  /**
   * Get the current value for a key (virtual derived state)
   */
  get(key) {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this;
    if (optimisticDeletes.has(key)) {
      return void 0;
    }
    if (optimisticUpserts.has(key)) {
      return optimisticUpserts.get(key);
    }
    return syncedData.get(key);
  }
  /**
   * Check if a key exists in the collection (virtual derived state)
   */
  has(key) {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this;
    if (optimisticDeletes.has(key)) {
      return false;
    }
    if (optimisticUpserts.has(key)) {
      return true;
    }
    return syncedData.has(key);
  }
  /**
   * Get all keys (virtual derived state)
   */
  *keys() {
    const { syncedData, optimisticDeletes, optimisticUpserts } = this;
    for (const key of syncedData.keys()) {
      if (!optimisticDeletes.has(key)) {
        yield key;
      }
    }
    for (const key of optimisticUpserts.keys()) {
      if (!syncedData.has(key) && !optimisticDeletes.has(key)) {
        yield key;
      }
    }
  }
  /**
   * Get all values (virtual derived state)
   */
  *values() {
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value !== void 0) {
        yield value;
      }
    }
  }
  /**
   * Get all entries (virtual derived state)
   */
  *entries() {
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value !== void 0) {
        yield [key, value];
      }
    }
  }
  /**
   * Get all entries (virtual derived state)
   */
  *[Symbol.iterator]() {
    for (const [key, value] of this.entries()) {
      yield [key, value];
    }
  }
  /**
   * Execute a callback for each entry in the collection
   */
  forEach(callbackfn) {
    let index = 0;
    for (const [key, value] of this.entries()) {
      callbackfn(value, key, index++);
    }
  }
  /**
   * Create a new array with the results of calling a function for each entry in the collection
   */
  map(callbackfn) {
    const result = [];
    let index = 0;
    for (const [key, value] of this.entries()) {
      result.push(callbackfn(value, key, index++));
    }
    return result;
  }
  /**
   * Check if the given collection is this collection
   * @param collection The collection to check
   * @returns True if the given collection is this collection, false otherwise
   */
  isThisCollection(collection) {
    return collection === this.collection;
  }
  /**
   * Recompute optimistic state from active transactions
   */
  recomputeOptimisticState(triggeredByUserAction = false) {
    if (this.isCommittingSyncTransactions && !triggeredByUserAction) {
      return;
    }
    const previousState = new Map(this.optimisticUpserts);
    const previousDeletes = new Set(this.optimisticDeletes);
    this.optimisticUpserts.clear();
    this.optimisticDeletes.clear();
    const activeTransactions = [];
    for (const transaction of this.transactions.values()) {
      if (![`completed`, `failed`].includes(transaction.state)) {
        activeTransactions.push(transaction);
      }
    }
    for (const transaction of activeTransactions) {
      for (const mutation of transaction.mutations) {
        if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
          switch (mutation.type) {
            case `insert`:
            case `update`:
              this.optimisticUpserts.set(
                mutation.key,
                mutation.modified
              );
              this.optimisticDeletes.delete(mutation.key);
              break;
            case `delete`:
              this.optimisticUpserts.delete(mutation.key);
              this.optimisticDeletes.add(mutation.key);
              break;
          }
        }
      }
    }
    this.size = this.calculateSize();
    const events = [];
    this.collectOptimisticChanges(previousState, previousDeletes, events);
    const filteredEventsBySyncStatus = events.filter((event) => {
      if (!this.recentlySyncedKeys.has(event.key)) {
        return true;
      }
      if (triggeredByUserAction) {
        return true;
      }
      return false;
    });
    if (this.pendingSyncedTransactions.length > 0 && !triggeredByUserAction) {
      const pendingSyncKeys = /* @__PURE__ */ new Set();
      for (const transaction of this.pendingSyncedTransactions) {
        for (const operation of transaction.operations) {
          pendingSyncKeys.add(operation.key);
        }
      }
      const filteredEvents = filteredEventsBySyncStatus.filter((event) => {
        if (event.type === `delete` && pendingSyncKeys.has(event.key)) {
          const hasActiveOptimisticMutation = activeTransactions.some(
            (tx) => tx.mutations.some(
              (m) => this.isThisCollection(m.collection) && m.key === event.key
            )
          );
          if (!hasActiveOptimisticMutation) {
            return false;
          }
        }
        return true;
      });
      if (filteredEvents.length > 0) {
        this.indexes.updateIndexes(filteredEvents);
      }
      this.changes.emitEvents(filteredEvents, triggeredByUserAction);
    } else {
      if (filteredEventsBySyncStatus.length > 0) {
        this.indexes.updateIndexes(filteredEventsBySyncStatus);
      }
      this.changes.emitEvents(filteredEventsBySyncStatus, triggeredByUserAction);
    }
  }
  /**
   * Calculate the current size based on synced data and optimistic changes
   */
  calculateSize() {
    const syncedSize = this.syncedData.size;
    const deletesFromSynced = Array.from(this.optimisticDeletes).filter(
      (key) => this.syncedData.has(key) && !this.optimisticUpserts.has(key)
    ).length;
    const upsertsNotInSynced = Array.from(this.optimisticUpserts.keys()).filter(
      (key) => !this.syncedData.has(key)
    ).length;
    return syncedSize - deletesFromSynced + upsertsNotInSynced;
  }
  /**
   * Collect events for optimistic changes
   */
  collectOptimisticChanges(previousUpserts, previousDeletes, events) {
    const allKeys = /* @__PURE__ */ new Set([
      ...previousUpserts.keys(),
      ...this.optimisticUpserts.keys(),
      ...previousDeletes,
      ...this.optimisticDeletes
    ]);
    for (const key of allKeys) {
      const currentValue = this.get(key);
      const previousValue = this.getPreviousValue(
        key,
        previousUpserts,
        previousDeletes
      );
      if (previousValue !== void 0 && currentValue === void 0) {
        events.push({ type: `delete`, key, value: previousValue });
      } else if (previousValue === void 0 && currentValue !== void 0) {
        events.push({ type: `insert`, key, value: currentValue });
      } else if (previousValue !== void 0 && currentValue !== void 0 && previousValue !== currentValue) {
        events.push({
          type: `update`,
          key,
          value: currentValue,
          previousValue
        });
      }
    }
  }
  /**
   * Get the previous value for a key given previous optimistic state
   */
  getPreviousValue(key, previousUpserts, previousDeletes) {
    if (previousDeletes.has(key)) {
      return void 0;
    }
    if (previousUpserts.has(key)) {
      return previousUpserts.get(key);
    }
    return this.syncedData.get(key);
  }
  /**
   * Schedule cleanup of a transaction when it completes
   */
  scheduleTransactionCleanup(transaction) {
    if (transaction.state === `completed`) {
      this.transactions.delete(transaction.id);
      return;
    }
    transaction.isPersisted.promise.then(() => {
      this.transactions.delete(transaction.id);
    }).catch(() => {
    });
  }
  /**
   * Capture visible state for keys that will be affected by pending sync operations
   * This must be called BEFORE onTransactionStateChange clears optimistic state
   */
  capturePreSyncVisibleState() {
    if (this.pendingSyncedTransactions.length === 0) return;
    const syncedKeys = /* @__PURE__ */ new Set();
    for (const transaction of this.pendingSyncedTransactions) {
      for (const operation of transaction.operations) {
        syncedKeys.add(operation.key);
      }
    }
    for (const key of syncedKeys) {
      this.recentlySyncedKeys.add(key);
    }
    for (const key of syncedKeys) {
      if (!this.preSyncVisibleState.has(key)) {
        const currentValue = this.get(key);
        if (currentValue !== void 0) {
          this.preSyncVisibleState.set(key, currentValue);
        }
      }
    }
  }
  /**
   * Trigger a recomputation when transactions change
   * This method should be called by the Transaction class when state changes
   */
  onTransactionStateChange() {
    this.changes.shouldBatchEvents = this.pendingSyncedTransactions.length > 0;
    this.capturePreSyncVisibleState();
    this.recomputeOptimisticState(false);
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.syncedData.clear();
    this.syncedMetadata.clear();
    this.optimisticUpserts.clear();
    this.optimisticDeletes.clear();
    this.size = 0;
    this.pendingSyncedTransactions = [];
    this.syncedKeys.clear();
    this.hasReceivedFirstCommit = false;
  }
}
export {
  CollectionStateManager
};
//# sourceMappingURL=state.js.map
