/**
 * # Optimized Index Data Structure
 *
 * Multi-level index that adapts storage strategy based on data patterns to minimize memory
 * usage, eliminate wasteful lookups, and avoid hashing whenever possible.
 *
 * ## Storage Strategy
 *
 * **Single value**: `IndexMap['key'] → [value, multiplicity]` (no hashing needed)
 *
 * **Multiple unprefixed values**: Direct ValueMap (avoids NO_PREFIX lookup)
 * ```
 * IndexMap['key'] → ValueMap { hash(value1) → [value1, mult1], ... }
 * ```
 *
 * **Values with prefixes**: PrefixMap uses prefix keys directly (no hashing)
 * ```
 * IndexMap['key'] → PrefixMap { 'prefix1' → [value1, mult1], NO_PREFIX → ValueMap{...} }
 * ```
 *
 * **Multiple values per prefix**: ValueMap within PrefixMap (hash only suffixes)
 * ```
 * PrefixMap['prefix'] → ValueMap { hash(suffix1) → [full_value1, mult1], ... }
 * ```
 *
 * ## Dynamic Evolution
 *
 * Structure automatically evolves as data is added:
 * - Single → ValueMap (when both values unprefixed)
 * - Single → PrefixMap (when at least one prefixed)
 * - ValueMap → PrefixMap (adding prefixed value to unprefixed)
 *
 * Prefixes extracted from array values: `['prefix', 'suffix']` → prefix='prefix'
 */

import { MultiSet } from './multiset.js'
import { hash } from './hashing/index.js'
import type { Hash } from './hashing/index.js'

// We use a symbol to represent the absence of a prefix, unprefixed values a stored
// against this key.
const NO_PREFIX = Symbol(`NO_PREFIX`)
type NO_PREFIX = typeof NO_PREFIX

// A single value is a tuple of the value and the multiplicity.
type SingleValue<TValue> = [TValue, number]

// Base map type for the index. Stores single values, prefix maps, or value maps against a key.
type IndexMap<TKey, TValue, TPrefix> = Map<
  TKey,
  SingleValue<TValue> | PrefixMap<TValue, TPrefix> | ValueMap<TValue>
>

// Second level map type for the index, stores single values or value maps against a prefix.
class PrefixMap<TValue, TPrefix> extends Map<
  TPrefix | NO_PREFIX,
  SingleValue<TValue> | ValueMap<TValue>
> {
  /**
   * Add a value to the PrefixMap. Returns true if the map becomes empty after the operation.
   */
  addValue(value: TValue, multiplicity: number): boolean {
    if (multiplicity === 0) return this.size === 0

    const prefix = getPrefix<TValue, TPrefix>(value)
    const valueMapOrSingleValue = this.get(prefix)

    if (isSingleValue(valueMapOrSingleValue)) {
      const [currentValue, currentMultiplicity] = valueMapOrSingleValue
      const currentPrefix = getPrefix<TValue, TPrefix>(currentValue)

      if (currentPrefix !== prefix) {
        throw new Error(`Mismatching prefixes, this should never happen`)
      }

      if (currentValue === value || hash(currentValue) === hash(value)) {
        // Same value, update multiplicity
        const newMultiplicity = currentMultiplicity + multiplicity
        if (newMultiplicity === 0) {
          this.delete(prefix)
        } else {
          this.set(prefix, [value, newMultiplicity])
        }
      } else {
        // Different suffixes, need to create ValueMap
        const valueMap = new ValueMap<TValue>()
        valueMap.set(hash(currentValue), valueMapOrSingleValue)
        valueMap.set(hash(value), [value, multiplicity])
        this.set(prefix, valueMap)
      }
    } else if (valueMapOrSingleValue === undefined) {
      // No existing value for this prefix
      this.set(prefix, [value, multiplicity])
    } else {
      // Existing ValueMap
      const isEmpty = valueMapOrSingleValue.addValue(value, multiplicity)
      if (isEmpty) {
        this.delete(prefix)
      }
    }

    return this.size === 0
  }
}

// Third level map type for the index, stores single values or value maps against a hash.
class ValueMap<TValue> extends Map<Hash, [TValue, number]> {
  /**
   * Add a value to the ValueMap. Returns true if the map becomes empty after the operation.
   * @param value - The full value to store
   * @param multiplicity - The multiplicity to add
   * @param hashKey - Optional hash key to use instead of hashing the full value (used when in PrefixMap context)
   */
  addValue(value: TValue, multiplicity: number): boolean {
    if (multiplicity === 0) return this.size === 0

    const key = hash(value)
    const currentValue = this.get(key)

    if (currentValue) {
      const [, currentMultiplicity] = currentValue
      const newMultiplicity = currentMultiplicity + multiplicity
      if (newMultiplicity === 0) {
        this.delete(key)
      } else {
        this.set(key, [value, newMultiplicity])
      }
    } else {
      this.set(key, [value, multiplicity])
    }

    return this.size === 0
  }
}

/**
 * A map from a difference collection trace's keys -> (value, multiplicities) that changed.
 * Used in operations like join and reduce where the operation needs to
 * exploit the key-value structure of the data to run efficiently.
 */
export class Index<TKey, TValue, TPrefix = any> {
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
  #inner: IndexMap<TKey, TValue, TPrefix>
  #consolidatedMultiplicity: Map<TKey, number> = new Map() // sum of multiplicities per key

  constructor() {
    this.#inner = new Map()
  }

  /**
   * Create an Index from multiple MultiSet messages.
   * @param messages - Array of MultiSet messages to build the index from.
   * @returns A new Index containing all the data from the messages.
   */
  static fromMultiSets<K, V>(messages: Array<MultiSet<[K, V]>>): Index<K, V> {
    const index = new Index<K, V>()

    for (const message of messages) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item
        index.addValue(key, [value, multiplicity])
      }
    }

    return index
  }

  /**
   * This method returns a string representation of the index.
   * @param indent - Whether to indent the string representation.
   * @returns A string representation of the index.
   */
  toString(indent = false): string {
    return `Index(${JSON.stringify(
      [...this.entries()],
      undefined,
      indent ? 2 : undefined,
    )})`
  }

  /**
   * The size of the index.
   */
  get size(): number {
    return this.#inner.size
  }

  /**
   * This method checks if the index has a given key.
   * @param key - The key to check.
   * @returns True if the index has the key, false otherwise.
   */
  has(key: TKey): boolean {
    return this.#inner.has(key)
  }

  /**
   * Check if a key has presence (non-zero consolidated multiplicity).
   * @param key - The key to check.
   * @returns True if the key has non-zero consolidated multiplicity, false otherwise.
   */
  hasPresence(key: TKey): boolean {
    return (this.#consolidatedMultiplicity.get(key) || 0) !== 0
  }

  /**
   * Get the consolidated multiplicity (sum of multiplicities) for a key.
   * @param key - The key to get the consolidated multiplicity for.
   * @returns The consolidated multiplicity for the key.
   */
  getConsolidatedMultiplicity(key: TKey): number {
    return this.#consolidatedMultiplicity.get(key) || 0
  }

  /**
   * Get all keys that have presence (non-zero consolidated multiplicity).
   * @returns An iterator of keys with non-zero consolidated multiplicity.
   */
  getPresenceKeys(): Iterable<TKey> {
    return this.#consolidatedMultiplicity.keys()
  }

  /**
   * This method returns all values for a given key.
   * @param key - The key to get the values for.
   * @returns An array of value tuples [value, multiplicity].
   */
  get(key: TKey): Array<[TValue, number]> {
    return [...this.getIterator(key)]
  }

  /**
   * This method returns an iterator over all values for a given key.
   * @param key - The key to get the values for.
   * @returns An iterator of value tuples [value, multiplicity].
   */
  *getIterator(key: TKey): Iterable<[TValue, number]> {
    const mapOrSingleValue = this.#inner.get(key)
    if (isSingleValue(mapOrSingleValue)) {
      yield mapOrSingleValue
    } else if (mapOrSingleValue === undefined) {
      return
    } else if (mapOrSingleValue instanceof ValueMap) {
      // Direct ValueMap - all values have NO_PREFIX
      for (const valueTuple of mapOrSingleValue.values()) {
        yield valueTuple
      }
    } else {
      // PrefixMap - iterate through all prefixes
      for (const singleValueOrValueMap of mapOrSingleValue.values()) {
        if (isSingleValue(singleValueOrValueMap)) {
          yield singleValueOrValueMap
        } else {
          for (const valueTuple of singleValueOrValueMap.values()) {
            yield valueTuple
          }
        }
      }
    }
  }

  /**
   * This returns an iterator that iterates over all key-value pairs.
   * @returns An iterable of all key-value pairs (and their multiplicities) in the index.
   */
  *entries(): Iterable<[TKey, [TValue, number]]> {
    for (const key of this.#inner.keys()) {
      for (const valueTuple of this.getIterator(key)) {
        yield [key, valueTuple]
      }
    }
  }

  /**
   * This method only iterates over the keys and not over the values.
   * Hence, it is more efficient than the `#entries` method.
   * It returns an iterator that you can use if you need to iterate over the values for a given key.
   * @returns An iterator of all *keys* in the index and their corresponding value iterator.
   */
  *entriesIterators(): Iterable<[TKey, Iterable<[TValue, number]>]> {
    for (const key of this.#inner.keys()) {
      yield [key, this.getIterator(key)]
    }
  }

  /**
   * This method adds a value to the index.
   * @param key - The key to add the value to.
   * @param valueTuple - The value tuple [value, multiplicity] to add to the index.
   */
  addValue(key: TKey, valueTuple: SingleValue<TValue>) {
    const [value, multiplicity] = valueTuple
    // If the multiplicity is 0, do nothing
    if (multiplicity === 0) return

    // Update consolidated multiplicity tracking
    const newConsolidatedMultiplicity =
      (this.#consolidatedMultiplicity.get(key) || 0) + multiplicity
    if (newConsolidatedMultiplicity === 0) {
      this.#consolidatedMultiplicity.delete(key)
    } else {
      this.#consolidatedMultiplicity.set(key, newConsolidatedMultiplicity)
    }

    const mapOrSingleValue = this.#inner.get(key)

    if (mapOrSingleValue === undefined) {
      // First value for this key
      this.#inner.set(key, valueTuple)
      return
    }

    if (isSingleValue(mapOrSingleValue)) {
      // Handle transition from single value to map
      this.#handleSingleValueTransition(
        key,
        mapOrSingleValue,
        value,
        multiplicity,
      )
      return
    }

    if (mapOrSingleValue instanceof ValueMap) {
      // Handle existing ValueMap
      const prefix = getPrefix<TValue, TPrefix>(value)
      if (prefix !== NO_PREFIX) {
        // Convert ValueMap to PrefixMap since we have a prefixed value
        const prefixMap = new PrefixMap<TValue, TPrefix>()
        prefixMap.set(NO_PREFIX, mapOrSingleValue)
        prefixMap.set(prefix, valueTuple)
        this.#inner.set(key, prefixMap)
      } else {
        // Add to existing ValueMap
        const isEmpty = mapOrSingleValue.addValue(value, multiplicity)
        if (isEmpty) {
          this.#inner.delete(key)
        }
      }
    } else {
      // Handle existing PrefixMap
      const isEmpty = mapOrSingleValue.addValue(value, multiplicity)
      if (isEmpty) {
        this.#inner.delete(key)
      }
    }
  }

  /**
   * Handle the transition from a single value to either a ValueMap or PrefixMap
   */
  #handleSingleValueTransition(
    key: TKey,
    currentSingleValue: SingleValue<TValue>,
    newValue: TValue,
    multiplicity: number,
  ) {
    const [currentValue, currentMultiplicity] = currentSingleValue

    // Check for exact same value (reference equality)
    if (currentValue === newValue) {
      const newMultiplicity = currentMultiplicity + multiplicity
      if (newMultiplicity === 0) {
        this.#inner.delete(key)
      } else {
        this.#inner.set(key, [newValue, newMultiplicity])
      }
      return
    }

    // Get prefixes for both values
    const newPrefix = getPrefix<TValue, TPrefix>(newValue)
    const currentPrefix = getPrefix<TValue, TPrefix>(currentValue)

    // Check if they're the same value by prefix/suffix comparison
    if (
      currentPrefix === newPrefix &&
      (currentValue === newValue || hash(currentValue) === hash(newValue))
    ) {
      const newMultiplicity = currentMultiplicity + multiplicity
      if (newMultiplicity === 0) {
        this.#inner.delete(key)
      } else {
        this.#inner.set(key, [newValue, newMultiplicity])
      }
      return
    }

    // Different values - choose appropriate map type
    if (currentPrefix === NO_PREFIX && newPrefix === NO_PREFIX) {
      // Both have NO_PREFIX, use ValueMap directly
      const valueMap = new ValueMap<TValue>()
      valueMap.set(hash(currentValue), currentSingleValue)
      valueMap.set(hash(newValue), [newValue, multiplicity])
      this.#inner.set(key, valueMap)
    } else {
      // At least one has a prefix, use PrefixMap
      const prefixMap = new PrefixMap<TValue, TPrefix>()

      if (currentPrefix === newPrefix) {
        // Same prefix, different suffixes - need ValueMap within PrefixMap
        const valueMap = new ValueMap<TValue>()
        valueMap.set(hash(currentValue), currentSingleValue)
        valueMap.set(hash(newValue), [newValue, multiplicity])
        prefixMap.set(currentPrefix, valueMap)
      } else {
        // Different prefixes - store as separate single values
        prefixMap.set(currentPrefix, currentSingleValue)
        prefixMap.set(newPrefix, [newValue, multiplicity])
      }

      this.#inner.set(key, prefixMap)
    }
  }

  /**
   * This method appends another index to the current index.
   * @param other - The index to append to the current index.
   */
  append(other: Index<TKey, TValue>): void {
    for (const [key, value] of other.entries()) {
      this.addValue(key, value)
    }
  }

  /**
   * This method joins two indexes.
   * @param other - The index to join with the current index.
   * @returns A multiset of the joined values.
   */
  join<TValue2>(
    other: Index<TKey, TValue2>,
  ): MultiSet<[TKey, [TValue, TValue2]]> {
    const result: Array<[[TKey, [TValue, TValue2]], number]> = []
    // We want to iterate over the smaller of the two indexes to reduce the
    // number of operations we need to do.
    if (this.size <= other.size) {
      for (const [key, valueIt] of this.entriesIterators()) {
        if (!other.has(key)) continue
        const otherValues = other.get(key)
        for (const [val1, mul1] of valueIt) {
          for (const [val2, mul2] of otherValues) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2])
            }
          }
        }
      }
    } else {
      for (const [key, otherValueIt] of other.entriesIterators()) {
        if (!this.has(key)) continue
        const values = this.get(key)
        for (const [val2, mul2] of otherValueIt) {
          for (const [val1, mul1] of values) {
            if (mul1 !== 0 && mul2 !== 0) {
              result.push([[key, [val1, val2]], mul1 * mul2])
            }
          }
        }
      }
    }

    return new MultiSet(result)
  }
}

/**
 * This function extracts the prefix from a value.
 * @param value - The value to extract the prefix from.
 * @returns The prefix and the suffix.
 */
function getPrefix<TValue, TPrefix>(value: TValue): TPrefix | NO_PREFIX {
  // If the value is an array and the first element is a string or number, then the
  // first element is the prefix. This is used to distinguish between values without
  // the need for hashing unless there are multiple values for the same prefix.
  if (
    Array.isArray(value) &&
    (typeof value[0] === `string` ||
      typeof value[0] === `number` ||
      typeof value[0] === `bigint`)
  ) {
    return value[0] as TPrefix
  }
  return NO_PREFIX
}

/**
 * This function checks if a value is a single value.
 * @param value - The value to check.
 * @returns True if the value is a single value, false otherwise.
 */
function isSingleValue<TValue>(
  value: SingleValue<TValue> | unknown,
): value is SingleValue<TValue> {
  return Array.isArray(value)
}
