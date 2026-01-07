"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const dbIvm = require("@tanstack/db-ivm");
const btree = require("../utils/btree.cjs");
const comparison = require("../utils/comparison.cjs");
const baseIndex = require("./base-index.cjs");
class BTreeIndex extends baseIndex.BaseIndex {
  constructor(id, expression, name, options) {
    super(id, expression, name, options);
    this.supportedOperations = /* @__PURE__ */ new Set([
      `eq`,
      `gt`,
      `gte`,
      `lt`,
      `lte`,
      `in`
    ]);
    this.valueMap = /* @__PURE__ */ new Map();
    this.indexedKeys = /* @__PURE__ */ new Set();
    this.compareFn = comparison.defaultComparator;
    this.compareFn = options?.compareFn ?? comparison.defaultComparator;
    if (options?.compareOptions) {
      this.compareOptions = options.compareOptions;
    }
    this.orderedEntries = new btree.BTree(this.compareFn);
  }
  initialize(_options) {
  }
  /**
   * Adds a value to the index
   */
  add(key, item) {
    let indexedValue;
    try {
      indexedValue = this.evaluateIndexExpression(item);
    } catch (error) {
      throw new Error(
        `Failed to evaluate index expression for key ${key}: ${error}`
      );
    }
    const normalizedValue = comparison.normalizeValue(indexedValue);
    if (this.valueMap.has(normalizedValue)) {
      this.valueMap.get(normalizedValue).add(key);
    } else {
      const keySet = /* @__PURE__ */ new Set([key]);
      this.valueMap.set(normalizedValue, keySet);
      this.orderedEntries.set(normalizedValue, void 0);
    }
    this.indexedKeys.add(key);
    this.updateTimestamp();
  }
  /**
   * Removes a value from the index
   */
  remove(key, item) {
    let indexedValue;
    try {
      indexedValue = this.evaluateIndexExpression(item);
    } catch (error) {
      console.warn(
        `Failed to evaluate index expression for key ${key} during removal:`,
        error
      );
      return;
    }
    const normalizedValue = comparison.normalizeValue(indexedValue);
    if (this.valueMap.has(normalizedValue)) {
      const keySet = this.valueMap.get(normalizedValue);
      keySet.delete(key);
      if (keySet.size === 0) {
        this.valueMap.delete(normalizedValue);
        this.orderedEntries.delete(normalizedValue);
      }
    }
    this.indexedKeys.delete(key);
    this.updateTimestamp();
  }
  /**
   * Updates a value in the index
   */
  update(key, oldItem, newItem) {
    this.remove(key, oldItem);
    this.add(key, newItem);
  }
  /**
   * Builds the index from a collection of entries
   */
  build(entries) {
    this.clear();
    for (const [key, item] of entries) {
      this.add(key, item);
    }
  }
  /**
   * Clears all data from the index
   */
  clear() {
    this.orderedEntries.clear();
    this.valueMap.clear();
    this.indexedKeys.clear();
    this.updateTimestamp();
  }
  /**
   * Performs a lookup operation
   */
  lookup(operation, value) {
    const startTime = performance.now();
    let result;
    switch (operation) {
      case `eq`:
        result = this.equalityLookup(value);
        break;
      case `gt`:
        result = this.rangeQuery({ from: value, fromInclusive: false });
        break;
      case `gte`:
        result = this.rangeQuery({ from: value, fromInclusive: true });
        break;
      case `lt`:
        result = this.rangeQuery({ to: value, toInclusive: false });
        break;
      case `lte`:
        result = this.rangeQuery({ to: value, toInclusive: true });
        break;
      case `in`:
        result = this.inArrayLookup(value);
        break;
      default:
        throw new Error(`Operation ${operation} not supported by BTreeIndex`);
    }
    this.trackLookup(startTime);
    return result;
  }
  /**
   * Gets the number of indexed keys
   */
  get keyCount() {
    return this.indexedKeys.size;
  }
  // Public methods for backward compatibility (used by tests)
  /**
   * Performs an equality lookup
   */
  equalityLookup(value) {
    const normalizedValue = comparison.normalizeValue(value);
    return new Set(this.valueMap.get(normalizedValue) ?? []);
  }
  /**
   * Performs a range query with options
   * This is more efficient for compound queries like "WHERE a > 5 AND a < 10"
   */
  rangeQuery(options = {}) {
    const { from, to, fromInclusive = true, toInclusive = true } = options;
    const result = /* @__PURE__ */ new Set();
    const normalizedFrom = comparison.normalizeValue(from);
    const normalizedTo = comparison.normalizeValue(to);
    const fromKey = normalizedFrom ?? this.orderedEntries.minKey();
    const toKey = normalizedTo ?? this.orderedEntries.maxKey();
    this.orderedEntries.forRange(
      fromKey,
      toKey,
      toInclusive,
      (indexedValue, _) => {
        if (!fromInclusive && this.compareFn(indexedValue, from) === 0) {
          return;
        }
        const keys = this.valueMap.get(indexedValue);
        if (keys) {
          keys.forEach((key) => result.add(key));
        }
      }
    );
    return result;
  }
  /**
   * Performs a reversed range query
   */
  rangeQueryReversed(options = {}) {
    const { from, to, fromInclusive = true, toInclusive = true } = options;
    return this.rangeQuery({
      from: to ?? this.orderedEntries.maxKey(),
      to: from ?? this.orderedEntries.minKey(),
      fromInclusive: toInclusive,
      toInclusive: fromInclusive
    });
  }
  takeInternal(n, nextPair, from, filterFn, reversed = false) {
    const keysInResult = /* @__PURE__ */ new Set();
    const result = [];
    let pair;
    let key = comparison.normalizeValue(from);
    while ((pair = nextPair(key)) !== void 0 && result.length < n) {
      key = pair[0];
      const keys = this.valueMap.get(key);
      if (keys && keys.size > 0) {
        const sorted = Array.from(keys).sort(dbIvm.compareKeys);
        if (reversed) sorted.reverse();
        for (const ks of sorted) {
          if (result.length >= n) break;
          if (!keysInResult.has(ks) && (filterFn?.(ks) ?? true)) {
            result.push(ks);
            keysInResult.add(ks);
          }
        }
      }
    }
    return result;
  }
  /**
   * Returns the next n items after the provided item or the first n items if no from item is provided.
   * @param n - The number of items to return
   * @param from - The item to start from (exclusive). Starts from the smallest item (inclusive) if not provided.
   * @returns The next n items after the provided key. Returns the first n items if no from item is provided.
   */
  take(n, from, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextHigherPair(k);
    return this.takeInternal(n, nextPair, from, filterFn);
  }
  /**
   * Returns the next n items **before** the provided item (in descending order) or the last n items if no from item is provided.
   * @param n - The number of items to return
   * @param from - The item to start from (exclusive). Starts from the largest item (inclusive) if not provided.
   * @returns The next n items **before** the provided key. Returns the last n items if no from item is provided.
   */
  takeReversed(n, from, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextLowerPair(k);
    return this.takeInternal(n, nextPair, from, filterFn, true);
  }
  /**
   * Performs an IN array lookup
   */
  inArrayLookup(values) {
    const result = /* @__PURE__ */ new Set();
    for (const value of values) {
      const normalizedValue = comparison.normalizeValue(value);
      const keys = this.valueMap.get(normalizedValue);
      if (keys) {
        keys.forEach((key) => result.add(key));
      }
    }
    return result;
  }
  // Getter methods for testing compatibility
  get indexedKeysSet() {
    return this.indexedKeys;
  }
  get orderedEntriesArray() {
    return this.orderedEntries.keysArray().map((key) => [key, this.valueMap.get(key) ?? /* @__PURE__ */ new Set()]);
  }
  get orderedEntriesArrayReversed() {
    return this.takeReversed(this.orderedEntries.size).map((key) => [
      key,
      this.valueMap.get(key) ?? /* @__PURE__ */ new Set()
    ]);
  }
  get valueMapData() {
    return this.valueMap;
  }
}
exports.BTreeIndex = BTreeIndex;
//# sourceMappingURL=btree-index.cjs.map
