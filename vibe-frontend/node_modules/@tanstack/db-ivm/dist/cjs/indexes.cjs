"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const multiset = require("./multiset.cjs");
const hash = require("./hashing/hash.cjs");
const NO_PREFIX = Symbol(`NO_PREFIX`);
class PrefixMap extends Map {
  /**
   * Add a value to the PrefixMap. Returns true if the map becomes empty after the operation.
   */
  addValue(value, multiplicity) {
    if (multiplicity === 0) return this.size === 0;
    const prefix = getPrefix(value);
    const valueMapOrSingleValue = this.get(prefix);
    if (isSingleValue(valueMapOrSingleValue)) {
      const [currentValue, currentMultiplicity] = valueMapOrSingleValue;
      const currentPrefix = getPrefix(currentValue);
      if (currentPrefix !== prefix) {
        throw new Error(`Mismatching prefixes, this should never happen`);
      }
      if (currentValue === value || hash.hash(currentValue) === hash.hash(value)) {
        const newMultiplicity = currentMultiplicity + multiplicity;
        if (newMultiplicity === 0) {
          this.delete(prefix);
        } else {
          this.set(prefix, [value, newMultiplicity]);
        }
      } else {
        const valueMap = new ValueMap();
        valueMap.set(hash.hash(currentValue), valueMapOrSingleValue);
        valueMap.set(hash.hash(value), [value, multiplicity]);
        this.set(prefix, valueMap);
      }
    } else if (valueMapOrSingleValue === void 0) {
      this.set(prefix, [value, multiplicity]);
    } else {
      const isEmpty = valueMapOrSingleValue.addValue(value, multiplicity);
      if (isEmpty) {
        this.delete(prefix);
      }
    }
    return this.size === 0;
  }
}
class ValueMap extends Map {
  /**
   * Add a value to the ValueMap. Returns true if the map becomes empty after the operation.
   * @param value - The full value to store
   * @param multiplicity - The multiplicity to add
   * @param hashKey - Optional hash key to use instead of hashing the full value (used when in PrefixMap context)
   */
  addValue(value, multiplicity) {
    if (multiplicity === 0) return this.size === 0;
    const key = hash.hash(value);
    const currentValue = this.get(key);
    if (currentValue) {
      const [, currentMultiplicity] = currentValue;
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.delete(key);
      } else {
        this.set(key, [value, newMultiplicity]);
      }
    } else {
      this.set(key, [value, multiplicity]);
    }
    return this.size === 0;
  }
}
class Index {
  /*
   * This index maintains a nested map of keys -> (value, multiplicities), where:
   * - initially the values are stored against the key as a single value tuple
   * - when a key gets additional values, the values are stored against the key in a
   *   prefix map
   * - the prefix is extract where possible from values that are structured as
   *   [rowPrimaryKey, rowValue], as they are in the Tanstack DB query pipeline.
   * - only when there are multiple values for a given prefix do we fall back to a
   *   hash to identify identical values, storing them in a third level value map.
   */
  #inner;
  #consolidatedMultiplicity = /* @__PURE__ */ new Map();
  // sum of multiplicities per key
  constructor() {
    this.#inner = /* @__PURE__ */ new Map();
  }
  /**
   * Create an Index from multiple MultiSet messages.
   * @param messages - Array of MultiSet messages to build the index from.
   * @returns A new Index containing all the data from the messages.
   */
  static fromMultiSets(messages) {
    const index = new Index();
    for (const message of messages) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item;
        index.addValue(key, [value, multiplicity]);
      }
    }
    return index;
  }
  /**
   * This method returns a string representation of the index.
   * @param indent - Whether to indent the string representation.
   * @returns A string representation of the index.
   */
  toString(indent = false) {
    return `Index(${JSON.stringify(
      [...this.entries()],
      void 0,
      indent ? 2 : void 0
    )})`;
  }
  /**
   * The size of the index.
   */
  get size() {
    return this.#inner.size;
  }
  /**
   * This method checks if the index has a given key.
   * @param key - The key to check.
   * @returns True if the index has the key, false otherwise.
   */
  has(key) {
    return this.#inner.has(key);
  }
  /**
   * Check if a key has presence (non-zero consolidated multiplicity).
   * @param key - The key to check.
   * @returns True if the key has non-zero consolidated multiplicity, false otherwise.
   */
  hasPresence(key) {
    return (this.#consolidatedMultiplicity.get(key) || 0) !== 0;
  }
  /**
   * Get the consolidated multiplicity (sum of multiplicities) for a key.
   * @param key - The key to get the consolidated multiplicity for.
   * @returns The consolidated multiplicity for the key.
   */
  getConsolidatedMultiplicity(key) {
    return this.#consolidatedMultiplicity.get(key) || 0;
  }
  /**
   * Get all keys that have presence (non-zero consolidated multiplicity).
   * @returns An iterator of keys with non-zero consolidated multiplicity.
   */
  getPresenceKeys() {
    return this.#consolidatedMultiplicity.keys();
  }
  /**
   * This method returns all values for a given key.
   * @param key - The key to get the values for.
   * @returns An array of value tuples [value, multiplicity].
   */
  get(key) {
    return [...this.getIterator(key)];
  }
  /**
   * This method returns an iterator over all values for a given key.
   * @param key - The key to get the values for.
   * @returns An iterator of value tuples [value, multiplicity].
   */
  *getIterator(key) {
    const mapOrSingleValue = this.#inner.get(key);
    if (isSingleValue(mapOrSingleValue)) {
      yield mapOrSingleValue;
    } else if (mapOrSingleValue === void 0) {
      return;
    } else if (mapOrSingleValue instanceof ValueMap) {
      for (const valueTuple of mapOrSingleValue.values()) {
        yield valueTuple;
      }
    } else {
      for (const singleValueOrValueMap of mapOrSingleValue.values()) {
        if (isSingleValue(singleValueOrValueMap)) {
          yield singleValueOrValueMap;
        } else {
          for (const valueTuple of singleValueOrValueMap.values()) {
            yield valueTuple;
          }
        }
      }
    }
  }
  /**
   * This returns an iterator that iterates over all key-value pairs.
   * @returns An iterable of all key-value pairs (and their multiplicities) in the index.
   */
  *entries() {
    for (const key of this.#inner.keys()) {
      for (const valueTuple of this.getIterator(key)) {
        yield [key, valueTuple];
      }
    }
  }
  /**
   * This method only iterates over the keys and not over the values.
   * Hence, it is more efficient than the `#entries` method.
   * It returns an iterator that you can use if you need to iterate over the values for a given key.
   * @returns An iterator of all *keys* in the index and their corresponding value iterator.
   */
  *entriesIterators() {
    for (const key of this.#inner.keys()) {
      yield [key, this.getIterator(key)];
    }
  }
  /**
   * This method adds a value to the index.
   * @param key - The key to add the value to.
   * @param valueTuple - The value tuple [value, multiplicity] to add to the index.
   */
  addValue(key, valueTuple) {
    const [value, multiplicity] = valueTuple;
    if (multiplicity === 0) return;
    const newConsolidatedMultiplicity = (this.#consolidatedMultiplicity.get(key) || 0) + multiplicity;
    if (newConsolidatedMultiplicity === 0) {
      this.#consolidatedMultiplicity.delete(key);
    } else {
      this.#consolidatedMultiplicity.set(key, newConsolidatedMultiplicity);
    }
    const mapOrSingleValue = this.#inner.get(key);
    if (mapOrSingleValue === void 0) {
      this.#inner.set(key, valueTuple);
      return;
    }
    if (isSingleValue(mapOrSingleValue)) {
      this.#handleSingleValueTransition(
        key,
        mapOrSingleValue,
        value,
        multiplicity
      );
      return;
    }
    if (mapOrSingleValue instanceof ValueMap) {
      const prefix = getPrefix(value);
      if (prefix !== NO_PREFIX) {
        const prefixMap = new PrefixMap();
        prefixMap.set(NO_PREFIX, mapOrSingleValue);
        prefixMap.set(prefix, valueTuple);
        this.#inner.set(key, prefixMap);
      } else {
        const isEmpty = mapOrSingleValue.addValue(value, multiplicity);
        if (isEmpty) {
          this.#inner.delete(key);
        }
      }
    } else {
      const isEmpty = mapOrSingleValue.addValue(value, multiplicity);
      if (isEmpty) {
        this.#inner.delete(key);
      }
    }
  }
  /**
   * Handle the transition from a single value to either a ValueMap or PrefixMap
   */
  #handleSingleValueTransition(key, currentSingleValue, newValue, multiplicity) {
    const [currentValue, currentMultiplicity] = currentSingleValue;
    if (currentValue === newValue) {
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.#inner.delete(key);
      } else {
        this.#inner.set(key, [newValue, newMultiplicity]);
      }
      return;
    }
    const newPrefix = getPrefix(newValue);
    const currentPrefix = getPrefix(currentValue);
    if (currentPrefix === newPrefix && (currentValue === newValue || hash.hash(currentValue) === hash.hash(newValue))) {
      const newMultiplicity = currentMultiplicity + multiplicity;
      if (newMultiplicity === 0) {
        this.#inner.delete(key);
      } else {
        this.#inner.set(key, [newValue, newMultiplicity]);
      }
      return;
    }
    if (currentPrefix === NO_PREFIX && newPrefix === NO_PREFIX) {
      const valueMap = new ValueMap();
      valueMap.set(hash.hash(currentValue), currentSingleValue);
      valueMap.set(hash.hash(newValue), [newValue, multiplicity]);
      this.#inner.set(key, valueMap);
    } else {
      const prefixMap = new PrefixMap();
      if (currentPrefix === newPrefix) {
        const valueMap = new ValueMap();
        valueMap.set(hash.hash(currentValue), currentSingleValue);
        valueMap.set(hash.hash(newValue), [newValue, multiplicity]);
        prefixMap.set(currentPrefix, valueMap);
      } else {
        prefixMap.set(currentPrefix, currentSingleValue);
        prefixMap.set(newPrefix, [newValue, multiplicity]);
      }
      this.#inner.set(key, prefixMap);
    }
  }
  /**
   * This method appends another index to the current index.
   * @param other - The index to append to the current index.
   */
  append(other) {
    for (const [key, value] of other.entries()) {
      this.addValue(key, value);
    }
  }
  /**
   * This method joins two indexes.
   * @param other - The index to join with the current index.
   * @returns A multiset of the joined values.
   */
  join(other) {
    const result = [];
    if (this.size <= other.size) {
      for (const [key, valueIt] of this.entriesIterators()) {
        if (!other.has(key)) continue;
        const otherValues = other.get(key);
        for (const [val1, mul1] of valueIt) {
          for (const [val2, mul2] of otherValues) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2]);
            }
          }
        }
      }
    } else {
      for (const [key, otherValueIt] of other.entriesIterators()) {
        if (!this.has(key)) continue;
        const values = this.get(key);
        for (const [val2, mul2] of otherValueIt) {
          for (const [val1, mul1] of values) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2]);
            }
          }
        }
      }
    }
    return new multiset.MultiSet(result);
  }
}
function getPrefix(value) {
  if (Array.isArray(value) && (typeof value[0] === `string` || typeof value[0] === `number` || typeof value[0] === `bigint`)) {
    return value[0];
  }
  return NO_PREFIX;
}
function isSingleValue(value) {
  return Array.isArray(value);
}
exports.Index = Index;
//# sourceMappingURL=indexes.cjs.map
