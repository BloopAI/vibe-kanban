/**
 * Generic utility functions
 */

import type { CompareOptions } from './query/builder/types'

interface TypedArray {
  length: number
  [index: number]: number
}

/**
 * Deep equality function that compares two values recursively
 * Handles primitives, objects, arrays, Date, RegExp, Map, Set, TypedArrays, and Temporal objects
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns True if the values are deeply equal, false otherwise
 *
 * @example
 * ```typescript
 * deepEquals({ a: 1, b: 2 }, { b: 2, a: 1 }) // true (property order doesn't matter)
 * deepEquals([1, { x: 2 }], [1, { x: 2 }]) // true
 * deepEquals({ a: 1 }, { a: 2 }) // false
 * deepEquals(new Date('2023-01-01'), new Date('2023-01-01')) // true
 * deepEquals(new Map([['a', 1]]), new Map([['a', 1]])) // true
 * ```
 */
export function deepEquals(a: any, b: any): boolean {
  return deepEqualsInternal(a, b, new Map())
}

/**
 * Internal implementation with cycle detection to prevent infinite recursion
 */
function deepEqualsInternal(
  a: any,
  b: any,
  visited: Map<object, object>,
): boolean {
  // Handle strict equality (primitives, same reference)
  if (a === b) return true

  // Handle null/undefined
  if (a == null || b == null) return false

  // Handle different types
  if (typeof a !== typeof b) return false

  // Handle Date objects
  if (a instanceof Date) {
    if (!(b instanceof Date)) return false
    return a.getTime() === b.getTime()
  }

  // Handle RegExp objects
  if (a instanceof RegExp) {
    if (!(b instanceof RegExp)) return false
    return a.source === b.source && a.flags === b.flags
  }

  // Handle Map objects - only if both are Maps
  if (a instanceof Map) {
    if (!(b instanceof Map)) return false
    if (a.size !== b.size) return false

    // Check for circular references
    if (visited.has(a)) {
      return visited.get(a) === b
    }
    visited.set(a, b)

    const entries = Array.from(a.entries())
    const result = entries.every(([key, val]) => {
      return b.has(key) && deepEqualsInternal(val, b.get(key), visited)
    })

    visited.delete(a)
    return result
  }

  // Handle Set objects - only if both are Sets
  if (a instanceof Set) {
    if (!(b instanceof Set)) return false
    if (a.size !== b.size) return false

    // Check for circular references
    if (visited.has(a)) {
      return visited.get(a) === b
    }
    visited.set(a, b)

    // Convert to arrays for comparison
    const aValues = Array.from(a)
    const bValues = Array.from(b)

    // Simple comparison for primitive values
    if (aValues.every((val) => typeof val !== `object`)) {
      visited.delete(a)
      return aValues.every((val) => b.has(val))
    }

    // For objects in sets, we need to do a more complex comparison
    // This is a simplified approach and may not work for all cases
    const result = aValues.length === bValues.length
    visited.delete(a)
    return result
  }

  // Handle TypedArrays
  if (
    ArrayBuffer.isView(a) &&
    ArrayBuffer.isView(b) &&
    !(a instanceof DataView) &&
    !(b instanceof DataView)
  ) {
    const typedA = a as unknown as TypedArray
    const typedB = b as unknown as TypedArray
    if (typedA.length !== typedB.length) return false

    for (let i = 0; i < typedA.length; i++) {
      if (typedA[i] !== typedB[i]) return false
    }

    return true
  }

  // Handle Temporal objects
  // Check if both are Temporal objects of the same type
  if (isTemporal(a) && isTemporal(b)) {
    const aTag = getStringTag(a)
    const bTag = getStringTag(b)

    // If they're different Temporal types, they're not equal
    if (aTag !== bTag) return false

    // Use Temporal's built-in equals method if available
    if (typeof a.equals === `function`) {
      return a.equals(b)
    }

    // Fallback to toString comparison for other types
    return a.toString() === b.toString()
  }

  // Handle arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false

    // Check for circular references
    if (visited.has(a)) {
      return visited.get(a) === b
    }
    visited.set(a, b)

    const result = a.every((item, index) =>
      deepEqualsInternal(item, b[index], visited),
    )
    visited.delete(a)
    return result
  }

  // Handle objects
  if (typeof a === `object`) {
    // Check for circular references
    if (visited.has(a)) {
      return visited.get(a) === b
    }
    visited.set(a, b)

    // Get all keys from both objects
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    // Check if they have the same number of keys
    if (keysA.length !== keysB.length) {
      visited.delete(a)
      return false
    }

    // Check if all keys exist in both objects and their values are equal
    const result = keysA.every(
      (key) => key in b && deepEqualsInternal(a[key], b[key], visited),
    )

    visited.delete(a)
    return result
  }

  // For primitives that aren't strictly equal
  return false
}

const temporalTypes = [
  `Temporal.Duration`,
  `Temporal.Instant`,
  `Temporal.PlainDate`,
  `Temporal.PlainDateTime`,
  `Temporal.PlainMonthDay`,
  `Temporal.PlainTime`,
  `Temporal.PlainYearMonth`,
  `Temporal.ZonedDateTime`,
]

function getStringTag(a: any): any {
  return a[Symbol.toStringTag]
}

/** Checks if the value is a Temporal object by checking for the Temporal brand */
export function isTemporal(a: any): boolean {
  const tag = getStringTag(a)
  return typeof tag === `string` && temporalTypes.includes(tag)
}

export const DEFAULT_COMPARE_OPTIONS: CompareOptions = {
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`,
}
