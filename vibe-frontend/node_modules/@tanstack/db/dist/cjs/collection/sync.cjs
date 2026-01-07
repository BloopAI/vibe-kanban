"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const errors = require("../errors.cjs");
const utils = require("../utils.cjs");
const internal = require("../query/live/internal.cjs");
class CollectionSyncManager {
  /**
   * Creates a new CollectionSyncManager instance
   */
  constructor(config, id) {
    this.preloadPromise = null;
    this.syncCleanupFn = null;
    this.syncLoadSubsetFn = null;
    this.syncUnloadSubsetFn = null;
    this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
    this.config = config;
    this.id = id;
    this.syncMode = config.syncMode ?? `eager`;
  }
  setDeps(deps) {
    this.collection = deps.collection;
    this.state = deps.state;
    this.lifecycle = deps.lifecycle;
    this._events = deps.events;
  }
  /**
   * Start the sync process for this collection
   * This is called when the collection is first accessed or preloaded
   */
  startSync() {
    if (this.lifecycle.status !== `idle` && this.lifecycle.status !== `cleaned-up`) {
      return;
    }
    this.lifecycle.setStatus(`loading`);
    try {
      const syncRes = normalizeSyncFnResult(
        this.config.sync.sync({
          collection: this.collection,
          begin: () => {
            this.state.pendingSyncedTransactions.push({
              committed: false,
              operations: [],
              deletedKeys: /* @__PURE__ */ new Set()
            });
          },
          write: (messageWithOptionalKey) => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new errors.NoPendingSyncTransactionWriteError();
            }
            if (pendingTransaction.committed) {
              throw new errors.SyncTransactionAlreadyCommittedWriteError();
            }
            let key = void 0;
            if (`key` in messageWithOptionalKey) {
              key = messageWithOptionalKey.key;
            } else {
              key = this.config.getKey(messageWithOptionalKey.value);
            }
            let messageType = messageWithOptionalKey.type;
            if (messageWithOptionalKey.type === `insert`) {
              const insertingIntoExistingSynced = this.state.syncedData.has(key);
              const hasPendingDeleteForKey = pendingTransaction.deletedKeys.has(key);
              const isTruncateTransaction = pendingTransaction.truncate === true;
              if (insertingIntoExistingSynced && !hasPendingDeleteForKey && !isTruncateTransaction) {
                const existingValue = this.state.syncedData.get(key);
                if (existingValue !== void 0 && utils.deepEquals(existingValue, messageWithOptionalKey.value)) {
                  messageType = `update`;
                } else {
                  const utils2 = this.config.utils;
                  const internal$1 = utils2[internal.LIVE_QUERY_INTERNAL];
                  throw new errors.DuplicateKeySyncError(key, this.id, {
                    hasCustomGetKey: internal$1?.hasCustomGetKey ?? false,
                    hasJoins: internal$1?.hasJoins ?? false
                  });
                }
              }
            }
            const message = {
              ...messageWithOptionalKey,
              type: messageType,
              key
            };
            pendingTransaction.operations.push(message);
            if (messageType === `delete`) {
              pendingTransaction.deletedKeys.add(key);
            }
          },
          commit: () => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new errors.NoPendingSyncTransactionCommitError();
            }
            if (pendingTransaction.committed) {
              throw new errors.SyncTransactionAlreadyCommittedError();
            }
            pendingTransaction.committed = true;
            this.state.commitPendingTransactions();
          },
          markReady: () => {
            this.lifecycle.markReady();
          },
          truncate: () => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new errors.NoPendingSyncTransactionWriteError();
            }
            if (pendingTransaction.committed) {
              throw new errors.SyncTransactionAlreadyCommittedWriteError();
            }
            pendingTransaction.operations = [];
            pendingTransaction.deletedKeys.clear();
            pendingTransaction.truncate = true;
            pendingTransaction.optimisticSnapshot = {
              upserts: new Map(this.state.optimisticUpserts),
              deletes: new Set(this.state.optimisticDeletes)
            };
          }
        })
      );
      this.syncCleanupFn = syncRes?.cleanup ?? null;
      this.syncLoadSubsetFn = syncRes?.loadSubset ?? null;
      this.syncUnloadSubsetFn = syncRes?.unloadSubset ?? null;
      if (this.syncMode === `on-demand` && !this.syncLoadSubsetFn) {
        throw new errors.CollectionConfigurationError(
          `Collection "${this.id}" is configured with syncMode "on-demand" but the sync function did not return a loadSubset handler. Either provide a loadSubset handler or use syncMode "eager".`
        );
      }
    } catch (error) {
      this.lifecycle.setStatus(`error`);
      throw error;
    }
  }
  /**
   * Preload the collection data by starting sync if not already started
   * Multiple concurrent calls will share the same promise
   */
  preload() {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }
    if (this.syncMode === `on-demand`) {
      console.warn(
        `${this.id ? `[${this.id}] ` : ``}Calling .preload() on a collection with syncMode "on-demand" is a no-op. In on-demand mode, data is only loaded when queries request it. Instead, create a live query and call .preload() on that to load the specific data you need. See https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync for more details.`
      );
    }
    this.preloadPromise = new Promise((resolve, reject) => {
      if (this.lifecycle.status === `ready`) {
        resolve();
        return;
      }
      if (this.lifecycle.status === `error`) {
        reject(new errors.CollectionIsInErrorStateError());
        return;
      }
      this.lifecycle.onFirstReady(() => {
        resolve();
      });
      if (this.lifecycle.status === `idle` || this.lifecycle.status === `cleaned-up`) {
        try {
          this.startSync();
        } catch (error) {
          reject(error);
          return;
        }
      }
    });
    return this.preloadPromise;
  }
  /**
   * Gets whether the collection is currently loading more data
   */
  get isLoadingSubset() {
    return this.pendingLoadSubsetPromises.size > 0;
  }
  /**
   * Tracks a load promise for isLoadingSubset state.
   * @internal This is for internal coordination (e.g., live-query glue code), not for general use.
   */
  trackLoadPromise(promise) {
    const loadingStarting = !this.isLoadingSubset;
    this.pendingLoadSubsetPromises.add(promise);
    if (loadingStarting) {
      this._events.emit(`loadingSubset:change`, {
        type: `loadingSubset:change`,
        collection: this.collection,
        isLoadingSubset: true,
        previousIsLoadingSubset: false,
        loadingSubsetTransition: `start`
      });
    }
    promise.finally(() => {
      const loadingEnding = this.pendingLoadSubsetPromises.size === 1 && this.pendingLoadSubsetPromises.has(promise);
      this.pendingLoadSubsetPromises.delete(promise);
      if (loadingEnding) {
        this._events.emit(`loadingSubset:change`, {
          type: `loadingSubset:change`,
          collection: this.collection,
          isLoadingSubset: false,
          previousIsLoadingSubset: true,
          loadingSubsetTransition: `end`
        });
      }
    });
  }
  /**
   * Requests the sync layer to load more data.
   * @param options Options to control what data is being loaded
   * @returns If data loading is asynchronous, this method returns a promise that resolves when the data is loaded.
   *          Returns true if no sync function is configured, if syncMode is 'eager', or if there is no work to do.
   */
  loadSubset(options) {
    if (this.syncMode === `eager`) {
      return true;
    }
    if (this.syncLoadSubsetFn) {
      const result = this.syncLoadSubsetFn(options);
      if (result instanceof Promise) {
        this.trackLoadPromise(result);
        return result;
      }
    }
    return true;
  }
  /**
   * Notifies the sync layer that a subset is no longer needed.
   * @param options Options that identify what data is being unloaded
   */
  unloadSubset(options) {
    if (this.syncUnloadSubsetFn) {
      this.syncUnloadSubsetFn(options);
    }
  }
  cleanup() {
    try {
      if (this.syncCleanupFn) {
        this.syncCleanupFn();
        this.syncCleanupFn = null;
      }
    } catch (error) {
      queueMicrotask(() => {
        if (error instanceof Error) {
          const wrappedError = new errors.SyncCleanupError(this.id, error);
          wrappedError.cause = error;
          wrappedError.stack = error.stack;
          throw wrappedError;
        } else {
          throw new errors.SyncCleanupError(this.id, error);
        }
      });
    }
    this.preloadPromise = null;
  }
}
function normalizeSyncFnResult(result) {
  if (typeof result === `function`) {
    return { cleanup: result };
  }
  if (typeof result === `object`) {
    return result;
  }
  return void 0;
}
exports.CollectionSyncManager = CollectionSyncManager;
//# sourceMappingURL=sync.cjs.map
