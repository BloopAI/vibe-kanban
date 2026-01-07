function isConstructor(resolver) {
  return typeof resolver === `function` && resolver.prototype !== void 0 && resolver.prototype.constructor === resolver;
}
async function resolveIndexConstructor(resolver) {
  if (isConstructor(resolver)) {
    return resolver;
  } else {
    return await resolver();
  }
}
class LazyIndexWrapper {
  constructor(id, expression, name, resolver, options, collectionEntries) {
    this.id = id;
    this.expression = expression;
    this.name = name;
    this.resolver = resolver;
    this.options = options;
    this.collectionEntries = collectionEntries;
    this.indexPromise = null;
    this.resolvedIndex = null;
    if (isConstructor(this.resolver)) {
      this.resolvedIndex = new this.resolver(
        this.id,
        this.expression,
        this.name,
        this.options
      );
      if (this.collectionEntries) {
        this.resolvedIndex.build(this.collectionEntries);
      }
    }
  }
  /**
   * Resolve the actual index
   */
  async resolve() {
    if (this.resolvedIndex) {
      return this.resolvedIndex;
    }
    if (!this.indexPromise) {
      this.indexPromise = this.createIndex();
    }
    this.resolvedIndex = await this.indexPromise;
    return this.resolvedIndex;
  }
  /**
   * Check if already resolved
   */
  isResolved() {
    return this.resolvedIndex !== null;
  }
  /**
   * Get resolved index (throws if not ready)
   */
  getResolved() {
    if (!this.resolvedIndex) {
      throw new Error(
        `Index ${this.id} has not been resolved yet. Ensure collection is synced.`
      );
    }
    return this.resolvedIndex;
  }
  /**
   * Get the index ID
   */
  getId() {
    return this.id;
  }
  /**
   * Get the index name
   */
  getName() {
    return this.name;
  }
  /**
   * Get the index expression
   */
  getExpression() {
    return this.expression;
  }
  async createIndex() {
    const IndexClass = await resolveIndexConstructor(this.resolver);
    return new IndexClass(this.id, this.expression, this.name, this.options);
  }
}
class IndexProxy {
  constructor(indexId, lazyIndex) {
    this.indexId = indexId;
    this.lazyIndex = lazyIndex;
  }
  /**
   * Get the resolved index (throws if not ready)
   */
  get index() {
    return this.lazyIndex.getResolved();
  }
  /**
   * Check if index is ready
   */
  get isReady() {
    return this.lazyIndex.isResolved();
  }
  /**
   * Wait for index to be ready
   */
  async whenReady() {
    return await this.lazyIndex.resolve();
  }
  /**
   * Get the index ID
   */
  get id() {
    return this.indexId;
  }
  /**
   * Get the index name (throws if not ready)
   */
  get name() {
    if (this.isReady) {
      return this.index.name;
    }
    return this.lazyIndex.getName();
  }
  /**
   * Get the index expression (available immediately)
   */
  get expression() {
    return this.lazyIndex.getExpression();
  }
  /**
   * Check if index supports an operation (throws if not ready)
   */
  supports(operation) {
    return this.index.supports(operation);
  }
  /**
   * Get index statistics (throws if not ready)
   */
  getStats() {
    return this.index.getStats();
  }
  /**
   * Check if index matches a field path (available immediately)
   */
  matchesField(fieldPath) {
    const expr = this.expression;
    return expr.type === `ref` && expr.path.length === fieldPath.length && expr.path.every((part, i) => part === fieldPath[i]);
  }
  /**
   * Get the key count (throws if not ready)
   */
  get keyCount() {
    return this.index.keyCount;
  }
  // Test compatibility properties - delegate to resolved index
  get indexedKeysSet() {
    const resolved = this.index;
    return resolved.indexedKeysSet;
  }
  get orderedEntriesArray() {
    const resolved = this.index;
    return resolved.orderedEntriesArray;
  }
  get valueMapData() {
    const resolved = this.index;
    return resolved.valueMapData;
  }
  // BTreeIndex compatibility methods
  equalityLookup(value) {
    const resolved = this.index;
    return resolved.equalityLookup?.(value) ?? /* @__PURE__ */ new Set();
  }
  rangeQuery(options) {
    const resolved = this.index;
    return resolved.rangeQuery?.(options) ?? /* @__PURE__ */ new Set();
  }
  inArrayLookup(values) {
    const resolved = this.index;
    return resolved.inArrayLookup?.(values) ?? /* @__PURE__ */ new Set();
  }
  // Internal method for the collection to get the lazy wrapper
  _getLazyWrapper() {
    return this.lazyIndex;
  }
}
export {
  IndexProxy,
  LazyIndexWrapper
};
//# sourceMappingURL=lazy-index.js.map
