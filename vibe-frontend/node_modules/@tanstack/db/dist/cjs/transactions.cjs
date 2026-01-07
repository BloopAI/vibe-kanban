"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const deferred = require("./deferred.cjs");
const errors = require("./errors.cjs");
const scheduler = require("./scheduler.cjs");
const transactions = [];
let transactionStack = [];
let sequenceNumber = 0;
function mergePendingMutations(existing, incoming) {
  switch (`${existing.type}-${incoming.type}`) {
    case `insert-update`: {
      return {
        ...existing,
        type: `insert`,
        original: {},
        modified: incoming.modified,
        changes: { ...existing.changes, ...incoming.changes },
        // Keep existing keys (key changes not allowed in updates)
        key: existing.key,
        globalKey: existing.globalKey,
        // Merge metadata (last-write-wins)
        metadata: incoming.metadata ?? existing.metadata,
        syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata },
        // Update tracking info
        mutationId: incoming.mutationId,
        updatedAt: incoming.updatedAt
      };
    }
    case `insert-delete`:
      return null;
    case `update-delete`:
      return incoming;
    case `update-update`: {
      return {
        ...incoming,
        // Keep original from first update
        original: existing.original,
        // Union the changes from both updates
        changes: { ...existing.changes, ...incoming.changes },
        // Merge metadata
        metadata: incoming.metadata ?? existing.metadata,
        syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata }
      };
    }
    case `delete-delete`:
    case `insert-insert`:
      return incoming;
    default: {
      const _exhaustive = `${existing.type}-${incoming.type}`;
      throw new Error(`Unhandled mutation combination: ${_exhaustive}`);
    }
  }
}
function createTransaction(config) {
  const newTransaction = new Transaction(config);
  transactions.push(newTransaction);
  return newTransaction;
}
function getActiveTransaction() {
  if (transactionStack.length > 0) {
    return transactionStack.slice(-1)[0];
  } else {
    return void 0;
  }
}
function registerTransaction(tx) {
  scheduler.transactionScopedScheduler.clear(tx.id);
  transactionStack.push(tx);
}
function unregisterTransaction(tx) {
  try {
    scheduler.transactionScopedScheduler.flush(tx.id);
  } finally {
    transactionStack = transactionStack.filter((t) => t.id !== tx.id);
  }
}
function removeFromPendingList(tx) {
  const index = transactions.findIndex((t) => t.id === tx.id);
  if (index !== -1) {
    transactions.splice(index, 1);
  }
}
class Transaction {
  constructor(config) {
    if (typeof config.mutationFn === `undefined`) {
      throw new errors.MissingMutationFunctionError();
    }
    this.id = config.id ?? crypto.randomUUID();
    this.mutationFn = config.mutationFn;
    this.state = `pending`;
    this.mutations = [];
    this.isPersisted = deferred.createDeferred();
    this.autoCommit = config.autoCommit ?? true;
    this.createdAt = /* @__PURE__ */ new Date();
    this.sequenceNumber = sequenceNumber++;
    this.metadata = config.metadata ?? {};
  }
  setState(newState) {
    this.state = newState;
    if (newState === `completed` || newState === `failed`) {
      removeFromPendingList(this);
    }
  }
  /**
   * Execute collection operations within this transaction
   * @param callback - Function containing collection operations to group together. If the
   * callback returns a Promise, the transaction context will remain active until the promise
   * settles, allowing optimistic writes after `await` boundaries.
   * @returns This transaction for chaining
   * @example
   * // Group multiple operations
   * const tx = createTransaction({ mutationFn: async () => {
   *   // Send to API
   * }})
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   *   collection.update("2", draft => { draft.completed = true })
   *   collection.delete("3")
   * })
   *
   * await tx.isPersisted.promise
   *
   * @example
   * // Handle mutate errors
   * try {
   *   tx.mutate(() => {
   *     collection.insert({ id: "invalid" }) // This might throw
   *   })
   * } catch (error) {
   *   console.log('Mutation failed:', error)
   * }
   *
   * @example
   * // Manual commit control
   * const tx = createTransaction({ autoCommit: false, mutationFn: async () => {} })
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Item" })
   * })
   *
   * // Commit later when ready
   * await tx.commit()
   */
  mutate(callback) {
    if (this.state !== `pending`) {
      throw new errors.TransactionNotPendingMutateError();
    }
    registerTransaction(this);
    try {
      callback();
    } finally {
      unregisterTransaction(this);
    }
    if (this.autoCommit) {
      this.commit().catch(() => {
      });
    }
    return this;
  }
  /**
   * Apply new mutations to this transaction, intelligently merging with existing mutations
   *
   * When mutations operate on the same item (same globalKey), they are merged according to
   * the following rules:
   *
   * - **insert + update** → insert (merge changes, keep empty original)
   * - **insert + delete** → removed (mutations cancel each other out)
   * - **update + delete** → delete (delete dominates)
   * - **update + update** → update (union changes, keep first original)
   * - **same type** → replace with latest
   *
   * This merging reduces over-the-wire churn and keeps the optimistic local view
   * aligned with user intent.
   *
   * @param mutations - Array of new mutations to apply
   */
  applyMutations(mutations) {
    for (const newMutation of mutations) {
      const existingIndex = this.mutations.findIndex(
        (m) => m.globalKey === newMutation.globalKey
      );
      if (existingIndex >= 0) {
        const existingMutation = this.mutations[existingIndex];
        const mergeResult = mergePendingMutations(existingMutation, newMutation);
        if (mergeResult === null) {
          this.mutations.splice(existingIndex, 1);
        } else {
          this.mutations[existingIndex] = mergeResult;
        }
      } else {
        this.mutations.push(newMutation);
      }
    }
  }
  /**
   * Rollback the transaction and any conflicting transactions
   * @param config - Configuration for rollback behavior
   * @returns This transaction for chaining
   * @example
   * // Manual rollback
   * const tx = createTransaction({ mutationFn: async () => {
   *   // Send to API
   * }})
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   * })
   *
   * // Rollback if needed
   * if (shouldCancel) {
   *   tx.rollback()
   * }
   *
   * @example
   * // Handle rollback cascade (automatic)
   * const tx1 = createTransaction({ mutationFn: async () => {} })
   * const tx2 = createTransaction({ mutationFn: async () => {} })
   *
   * tx1.mutate(() => collection.update("1", draft => { draft.value = "A" }))
   * tx2.mutate(() => collection.update("1", draft => { draft.value = "B" })) // Same item
   *
   * tx1.rollback() // This will also rollback tx2 due to conflict
   *
   * @example
   * // Handle rollback in error scenarios
   * try {
   *   await tx.isPersisted.promise
   * } catch (error) {
   *   console.log('Transaction was rolled back:', error)
   *   // Transaction automatically rolled back on mutation function failure
   * }
   */
  rollback(config) {
    const isSecondaryRollback = config?.isSecondaryRollback ?? false;
    if (this.state === `completed`) {
      throw new errors.TransactionAlreadyCompletedRollbackError();
    }
    this.setState(`failed`);
    if (!isSecondaryRollback) {
      const mutationIds = /* @__PURE__ */ new Set();
      this.mutations.forEach((m) => mutationIds.add(m.globalKey));
      for (const t of transactions) {
        t.state === `pending` && t.mutations.some((m) => mutationIds.has(m.globalKey)) && t.rollback({ isSecondaryRollback: true });
      }
    }
    this.isPersisted.reject(this.error?.error);
    this.touchCollection();
    return this;
  }
  // Tell collection that something has changed with the transaction
  touchCollection() {
    const hasCalled = /* @__PURE__ */ new Set();
    for (const mutation of this.mutations) {
      if (!hasCalled.has(mutation.collection.id)) {
        mutation.collection._state.onTransactionStateChange();
        if (mutation.collection._state.pendingSyncedTransactions.length > 0) {
          mutation.collection._state.commitPendingTransactions();
        }
        hasCalled.add(mutation.collection.id);
      }
    }
  }
  /**
   * Commit the transaction and execute the mutation function
   * @returns Promise that resolves to this transaction when complete
   * @example
   * // Manual commit (when autoCommit is false)
   * const tx = createTransaction({
   *   autoCommit: false,
   *   mutationFn: async ({ transaction }) => {
   *     await api.saveChanges(transaction.mutations)
   *   }
   * })
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   * })
   *
   * await tx.commit() // Manually commit
   *
   * @example
   * // Handle commit errors
   * try {
   *   const tx = createTransaction({
   *     mutationFn: async () => { throw new Error("API failed") }
   *   })
   *
   *   tx.mutate(() => {
   *     collection.insert({ id: "1", text: "Item" })
   *   })
   *
   *   await tx.commit()
   * } catch (error) {
   *   console.log('Commit failed, transaction rolled back:', error)
   * }
   *
   * @example
   * // Check transaction state after commit
   * await tx.commit()
   * console.log(tx.state) // "completed" or "failed"
   */
  async commit() {
    if (this.state !== `pending`) {
      throw new errors.TransactionNotPendingCommitError();
    }
    this.setState(`persisting`);
    if (this.mutations.length === 0) {
      this.setState(`completed`);
      this.isPersisted.resolve(this);
      return this;
    }
    try {
      await this.mutationFn({
        transaction: this
      });
      this.setState(`completed`);
      this.touchCollection();
      this.isPersisted.resolve(this);
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      this.error = {
        message: originalError.message,
        error: originalError
      };
      this.rollback();
      throw originalError;
    }
    return this;
  }
  /**
   * Compare two transactions by their createdAt time and sequence number in order
   * to sort them in the order they were created.
   * @param other - The other transaction to compare to
   * @returns -1 if this transaction was created before the other, 1 if it was created after, 0 if they were created at the same time
   */
  compareCreatedAt(other) {
    const createdAtComparison = this.createdAt.getTime() - other.createdAt.getTime();
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }
    return this.sequenceNumber - other.sequenceNumber;
  }
}
exports.createTransaction = createTransaction;
exports.getActiveTransaction = getActiveTransaction;
//# sourceMappingURL=transactions.cjs.map
