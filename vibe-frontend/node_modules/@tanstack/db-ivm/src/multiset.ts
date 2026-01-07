import {
  DefaultMap,
  chunkedArrayPush,
  globalObjectIdGenerator,
} from './utils.js'
import { hash } from './hashing/index.js'

export type MultiSetArray<T> = Array<[T, number]>
export type KeyedData<T> = [key: string, value: T]

/**
 * A multiset of data.
 */
export class MultiSet<T> {
  #inner: MultiSetArray<T>

  constructor(data: MultiSetArray<T> = []) {
    this.#inner = data
  }

  toString(indent = false): string {
    return `MultiSet(${JSON.stringify(this.#inner, null, indent ? 2 : undefined)})`
  }

  toJSON(): string {
    return JSON.stringify(Array.from(this.getInner()))
  }

  static fromJSON<U>(json: string): MultiSet<U> {
    return new MultiSet(JSON.parse(json))
  }

  /**
   * Apply a function to all records in the collection.
   */
  map<U>(f: (data: T) => U): MultiSet<U> {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [f(data), multiplicity]),
    )
  }

  /**
   * Filter out records for which a function f(record) evaluates to False.
   */
  filter(f: (data: T) => boolean): MultiSet<T> {
    return new MultiSet(this.#inner.filter(([data, _]) => f(data)))
  }

  /**
   * Negate all multiplicities in the collection.
   */
  negate(): MultiSet<T> {
    return new MultiSet(
      this.#inner.map(([data, multiplicity]) => [data, -multiplicity]),
    )
  }

  /**
   * Concatenate two collections together.
   */
  concat(other: MultiSet<T>): MultiSet<T> {
    const out: MultiSetArray<T> = []
    chunkedArrayPush(out, this.#inner)
    chunkedArrayPush(out, other.getInner())
    return new MultiSet(out)
  }

  /**
   * Produce as output a collection that is logically equivalent to the input
   * but which combines identical instances of the same record into one
   * (record, multiplicity) pair.
   */
  consolidate(): MultiSet<T> {
    // Check if this looks like a keyed multiset (first item is a tuple of length 2)
    if (this.#inner.length > 0) {
      const firstItem = this.#inner[0]?.[0]
      if (Array.isArray(firstItem) && firstItem.length === 2) {
        return this.#consolidateKeyed()
      }
    }

    // Fall back to original method for unkeyed data
    return this.#consolidateUnkeyed()
  }

  /**
   * Private method for consolidating keyed multisets where keys are strings/numbers
   * and values are compared by reference equality.
   *
   * This method provides significant performance improvements over the hash-based approach
   * by using WeakMap for object reference tracking and avoiding expensive serialization.
   *
   * Special handling for join operations: When values are tuples of length 2 (common in joins),
   * we unpack them and compare each element individually to maintain proper equality semantics.
   */
  #consolidateKeyed(): MultiSet<T> {
    const consolidated = new Map<string, number>()
    const values = new Map<string, T>()

    // Use global object ID generator for consistent reference equality

    /**
     * Special handler for tuples (arrays of length 2) commonly produced by join operations.
     * Unpacks the tuple and generates an ID based on both elements to ensure proper
     * consolidation of join results like ['A', null] and [null, 'X'].
     */
    const getTupleId = (tuple: Array<any>): string => {
      if (tuple.length !== 2) {
        throw new Error(`Expected tuple of length 2`)
      }
      const [first, second] = tuple
      return `${globalObjectIdGenerator.getStringId(first)}|${globalObjectIdGenerator.getStringId(second)}`
    }

    // Process each item in the multiset
    for (const [data, multiplicity] of this.#inner) {
      // Verify this is still a keyed item (should be [key, value] pair)
      if (!Array.isArray(data) || data.length !== 2) {
        // Found non-keyed item, fall back to unkeyed consolidation
        return this.#consolidateUnkeyed()
      }

      const [key, value] = data

      // Verify key is string or number as expected for keyed multisets
      if (typeof key !== `string` && typeof key !== `number`) {
        // Found non-string/number key, fall back to unkeyed consolidation
        return this.#consolidateUnkeyed()
      }

      // Generate value ID with special handling for join tuples
      let valueId: string
      if (Array.isArray(value) && value.length === 2) {
        // Special case: value is a tuple from join operations
        valueId = getTupleId(value)
      } else {
        // Regular case: use reference/value equality
        valueId = globalObjectIdGenerator.getStringId(value)
      }

      // Create composite key and consolidate
      const compositeKey = key + `|` + valueId
      consolidated.set(
        compositeKey,
        (consolidated.get(compositeKey) || 0) + multiplicity,
      )

      // Store the original data for the first occurrence
      if (!values.has(compositeKey)) {
        values.set(compositeKey, data as T)
      }
    }

    // Build result array, filtering out zero multiplicities
    const result: MultiSetArray<T> = []
    for (const [compositeKey, multiplicity] of consolidated) {
      if (multiplicity !== 0) {
        result.push([values.get(compositeKey)!, multiplicity])
      }
    }

    return new MultiSet(result)
  }

  /**
   * Private method for consolidating unkeyed multisets using the original approach.
   */
  #consolidateUnkeyed(): MultiSet<T> {
    const consolidated = new DefaultMap<string | number, number>(() => 0)
    const values = new Map<string, any>()

    let hasString = false
    let hasNumber = false
    let hasOther = false
    for (const [data, _] of this.#inner) {
      if (typeof data === `string`) {
        hasString = true
      } else if (typeof data === `number`) {
        hasNumber = true
      } else {
        hasOther = true
        break
      }
    }

    const requireJson = hasOther || (hasString && hasNumber)

    for (const [data, multiplicity] of this.#inner) {
      const key = requireJson ? hash(data) : (data as string | number)
      if (requireJson && !values.has(key as string)) {
        values.set(key as string, data)
      }
      consolidated.update(key, (count) => count + multiplicity)
    }

    const result: MultiSetArray<T> = []
    for (const [key, multiplicity] of consolidated.entries()) {
      if (multiplicity !== 0) {
        const parsedKey = requireJson ? values.get(key as string) : key
        result.push([parsedKey as T, multiplicity])
      }
    }

    return new MultiSet(result)
  }

  extend(other: MultiSet<T> | MultiSetArray<T>): void {
    const otherArray = other instanceof MultiSet ? other.getInner() : other
    chunkedArrayPush(this.#inner, otherArray)
  }

  add(item: T, multiplicity: number): void {
    if (multiplicity !== 0) {
      this.#inner.push([item, multiplicity])
    }
  }

  getInner(): MultiSetArray<T> {
    return this.#inner
  }
}
