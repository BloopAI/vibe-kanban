"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const lazyIndex = require("../indexes/lazy-index.cjs");
const refProxy = require("../query/builder/ref-proxy.cjs");
const btreeIndex = require("../indexes/btree-index.cjs");
class CollectionIndexesManager {
  constructor() {
    this.lazyIndexes = /* @__PURE__ */ new Map();
    this.resolvedIndexes = /* @__PURE__ */ new Map();
    this.isIndexesResolved = false;
    this.indexCounter = 0;
  }
  setDeps(deps) {
    this.state = deps.state;
    this.lifecycle = deps.lifecycle;
  }
  /**
   * Creates an index on a collection for faster queries.
   */
  createIndex(indexCallback, config = {}) {
    this.lifecycle.validateCollectionUsable(`createIndex`);
    const indexId = ++this.indexCounter;
    const singleRowRefProxy = refProxy.createSingleRowRefProxy();
    const indexExpression = indexCallback(singleRowRefProxy);
    const expression = refProxy.toExpression(indexExpression);
    const resolver = config.indexType ?? btreeIndex.BTreeIndex;
    const lazyIndex$1 = new lazyIndex.LazyIndexWrapper(
      indexId,
      expression,
      config.name,
      resolver,
      config.options,
      this.state.entries()
    );
    this.lazyIndexes.set(indexId, lazyIndex$1);
    if (resolver === btreeIndex.BTreeIndex) {
      try {
        const resolvedIndex = lazyIndex$1.getResolved();
        this.resolvedIndexes.set(indexId, resolvedIndex);
      } catch (error) {
        console.warn(`Failed to resolve BTreeIndex:`, error);
      }
    } else if (typeof resolver === `function` && resolver.prototype) {
      try {
        const resolvedIndex = lazyIndex$1.getResolved();
        this.resolvedIndexes.set(indexId, resolvedIndex);
      } catch {
        this.resolveSingleIndex(indexId, lazyIndex$1).catch((error) => {
          console.warn(`Failed to resolve single index:`, error);
        });
      }
    } else if (this.isIndexesResolved) {
      this.resolveSingleIndex(indexId, lazyIndex$1).catch((error) => {
        console.warn(`Failed to resolve single index:`, error);
      });
    }
    return new lazyIndex.IndexProxy(indexId, lazyIndex$1);
  }
  /**
   * Resolve all lazy indexes (called when collection first syncs)
   */
  async resolveAllIndexes() {
    if (this.isIndexesResolved) return;
    const resolutionPromises = Array.from(this.lazyIndexes.entries()).map(
      async ([indexId, lazyIndex2]) => {
        const resolvedIndex = await lazyIndex2.resolve();
        resolvedIndex.build(this.state.entries());
        this.resolvedIndexes.set(indexId, resolvedIndex);
        return { indexId, resolvedIndex };
      }
    );
    await Promise.all(resolutionPromises);
    this.isIndexesResolved = true;
  }
  /**
   * Resolve a single index immediately
   */
  async resolveSingleIndex(indexId, lazyIndex2) {
    const resolvedIndex = await lazyIndex2.resolve();
    resolvedIndex.build(this.state.entries());
    this.resolvedIndexes.set(indexId, resolvedIndex);
    return resolvedIndex;
  }
  /**
   * Get resolved indexes for query optimization
   */
  get indexes() {
    return this.resolvedIndexes;
  }
  /**
   * Updates all indexes when the collection changes
   */
  updateIndexes(changes) {
    for (const index of this.resolvedIndexes.values()) {
      for (const change of changes) {
        switch (change.type) {
          case `insert`:
            index.add(change.key, change.value);
            break;
          case `update`:
            if (change.previousValue) {
              index.update(change.key, change.previousValue, change.value);
            } else {
              index.add(change.key, change.value);
            }
            break;
          case `delete`:
            index.remove(change.key, change.value);
            break;
        }
      }
    }
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.lazyIndexes.clear();
    this.resolvedIndexes.clear();
  }
}
exports.CollectionIndexesManager = CollectionIndexesManager;
//# sourceMappingURL=indexes.cjs.map
