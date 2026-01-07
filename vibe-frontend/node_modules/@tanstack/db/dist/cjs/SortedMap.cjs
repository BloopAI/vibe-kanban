"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const dbIvm = require("@tanstack/db-ivm");
class SortedMap {
  /**
   * Creates a new SortedMap instance
   *
   * @param comparator - Optional function to compare values for sorting.
   *                     If not provided, entries are sorted by key only.
   */
  constructor(comparator) {
    this.map = /* @__PURE__ */ new Map();
    this.sortedKeys = [];
    this.comparator = comparator;
  }
  /**
   * Finds the index where a key-value pair should be inserted to maintain sort order.
   * Uses binary search to find the correct position based on the value (if comparator provided),
   * with key-based tie-breaking for deterministic ordering when values compare as equal.
   * If no comparator is provided, sorts by key only.
   * Runs in O(log n) time.
   *
   * @param key - The key to find position for (used as tie-breaker or primary sort when no comparator)
   * @param value - The value to compare against (only used if comparator is provided)
   * @returns The index where the key should be inserted
   */
  indexOf(key, value) {
    let left = 0;
    let right = this.sortedKeys.length;
    if (!this.comparator) {
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        const midKey = this.sortedKeys[mid];
        const keyComparison = dbIvm.compareKeys(key, midKey);
        if (keyComparison < 0) {
          right = mid;
        } else if (keyComparison > 0) {
          left = mid + 1;
        } else {
          return mid;
        }
      }
      return left;
    }
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midKey = this.sortedKeys[mid];
      const midValue = this.map.get(midKey);
      const valueComparison = this.comparator(value, midValue);
      if (valueComparison < 0) {
        right = mid;
      } else if (valueComparison > 0) {
        left = mid + 1;
      } else {
        const keyComparison = dbIvm.compareKeys(key, midKey);
        if (keyComparison < 0) {
          right = mid;
        } else if (keyComparison > 0) {
          left = mid + 1;
        } else {
          return mid;
        }
      }
    }
    return left;
  }
  /**
   * Sets a key-value pair in the map and maintains sort order
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns This SortedMap instance for chaining
   */
  set(key, value) {
    if (this.map.has(key)) {
      const oldValue = this.map.get(key);
      const oldIndex = this.indexOf(key, oldValue);
      this.sortedKeys.splice(oldIndex, 1);
    }
    const index = this.indexOf(key, value);
    this.sortedKeys.splice(index, 0, key);
    this.map.set(key, value);
    return this;
  }
  /**
   * Gets a value by its key
   *
   * @param key - The key to look up
   * @returns The value associated with the key, or undefined if not found
   */
  get(key) {
    return this.map.get(key);
  }
  /**
   * Removes a key-value pair from the map
   *
   * @param key - The key to remove
   * @returns True if the key was found and removed, false otherwise
   */
  delete(key) {
    if (this.map.has(key)) {
      const oldValue = this.map.get(key);
      const index = this.indexOf(key, oldValue);
      this.sortedKeys.splice(index, 1);
      return this.map.delete(key);
    }
    return false;
  }
  /**
   * Checks if a key exists in the map
   *
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key) {
    return this.map.has(key);
  }
  /**
   * Removes all key-value pairs from the map
   */
  clear() {
    this.map.clear();
    this.sortedKeys = [];
  }
  /**
   * Gets the number of key-value pairs in the map
   */
  get size() {
    return this.map.size;
  }
  /**
   * Default iterator that returns entries in sorted order
   *
   * @returns An iterator for the map's entries
   */
  *[Symbol.iterator]() {
    for (const key of this.sortedKeys) {
      yield [key, this.map.get(key)];
    }
  }
  /**
   * Returns an iterator for the map's entries in sorted order
   *
   * @returns An iterator for the map's entries
   */
  entries() {
    return this[Symbol.iterator]();
  }
  /**
   * Returns an iterator for the map's keys in sorted order
   *
   * @returns An iterator for the map's keys
   */
  keys() {
    return this.sortedKeys[Symbol.iterator]();
  }
  /**
   * Returns an iterator for the map's values in sorted order
   *
   * @returns An iterator for the map's values
   */
  values() {
    return (function* () {
      for (const key of this.sortedKeys) {
        yield this.map.get(key);
      }
    }).call(this);
  }
  /**
   * Executes a callback function for each key-value pair in the map in sorted order
   *
   * @param callbackfn - Function to execute for each entry
   */
  forEach(callbackfn) {
    for (const key of this.sortedKeys) {
      callbackfn(this.map.get(key), key, this.map);
    }
  }
}
exports.SortedMap = SortedMap;
//# sourceMappingURL=SortedMap.cjs.map
