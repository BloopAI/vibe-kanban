import type { CompareOptions } from '../query/builder/types'

// WeakMap to store stable IDs for objects
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1

/**
 * Get or create a stable ID for an object
 */
function getObjectId(obj: object): number {
  if (objectIds.has(obj)) {
    return objectIds.get(obj)!
  }
  const id = nextObjectId++
  objectIds.set(obj, id)
  return id
}

/**
 * Universal comparison function for all data types
 * Handles null/undefined, strings, arrays, dates, objects, and primitives
 * Always sorts null/undefined values first
 */
export const ascComparator = (a: any, b: any, opts: CompareOptions): number => {
  const { nulls } = opts

  // Handle null/undefined
  if (a == null && b == null) return 0
  if (a == null) return nulls === `first` ? -1 : 1
  if (b == null) return nulls === `first` ? 1 : -1

  // if a and b are both strings, compare them based on locale
  if (typeof a === `string` && typeof b === `string`) {
    if (opts.stringSort === `locale`) {
      return a.localeCompare(b, opts.locale, opts.localeOptions)
    }
    // For lexical sort we rely on direct comparison for primitive values
  }

  // if a and b are both arrays, compare them element by element
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const result = ascComparator(a[i], b[i], opts)
      if (result !== 0) {
        return result
      }
    }
    // All elements are equal up to the minimum length
    return a.length - b.length
  }

  // If both are dates, compare them
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime()
  }

  // If at least one of the values is an object, use stable IDs for comparison
  const aIsObject = typeof a === `object`
  const bIsObject = typeof b === `object`

  if (aIsObject || bIsObject) {
    // If both are objects, compare their stable IDs
    if (aIsObject && bIsObject) {
      const aId = getObjectId(a)
      const bId = getObjectId(b)
      return aId - bId
    }

    // If only one is an object, objects come after primitives
    if (aIsObject) return 1
    if (bIsObject) return -1
  }

  // For primitive values, use direct comparison
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Descending comparator function for ordering values
 * Handles null/undefined as largest values (opposite of ascending)
 */
export const descComparator = (
  a: unknown,
  b: unknown,
  opts: CompareOptions,
): number => {
  return ascComparator(b, a, {
    ...opts,
    nulls: opts.nulls === `first` ? `last` : `first`,
  })
}

export function makeComparator(
  opts: CompareOptions,
): (a: any, b: any) => number {
  return (a, b) => {
    if (opts.direction === `asc`) {
      return ascComparator(a, b, opts)
    } else {
      return descComparator(a, b, opts)
    }
  }
}

/** Default comparator orders values in ascending order with nulls first and locale string comparison. */
export const defaultComparator = makeComparator({
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`,
})

/**
 * Compare two Uint8Arrays for content equality
 */
function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

/**
 * Threshold for normalizing Uint8Arrays to string representations.
 * Arrays larger than this will use reference equality to avoid memory overhead.
 * 128 bytes is enough for common ID formats (ULIDs are 16 bytes, UUIDs are 16 bytes)
 * while avoiding excessive string allocation for large binary data.
 */
const UINT8ARRAY_NORMALIZE_THRESHOLD = 128

/**
 * Normalize a value for comparison and Map key usage
 * Converts values that can't be directly compared or used as Map keys
 * into comparable primitive representations
 */
export function normalizeValue(value: any): any {
  if (value instanceof Date) {
    return value.getTime()
  }

  // Normalize Uint8Arrays/Buffers to a string representation for Map key usage
  // This enables content-based equality for binary data like ULIDs
  const isUint8Array =
    (typeof Buffer !== `undefined` && value instanceof Buffer) ||
    value instanceof Uint8Array

  if (isUint8Array) {
    // Only normalize small arrays to avoid memory overhead for large binary data
    if (value.byteLength <= UINT8ARRAY_NORMALIZE_THRESHOLD) {
      // Convert to a string representation that can be used as a Map key
      // Use a special prefix to avoid collisions with user strings
      return `__u8__${Array.from(value).join(`,`)}`
    }
    // For large arrays, fall back to reference equality
    // Users working with large binary data should use a derived key if needed
  }

  return value
}

/**
 * Compare two values for equality, with special handling for Uint8Arrays and Buffers
 */
export function areValuesEqual(a: any, b: any): boolean {
  // Fast path for reference equality
  if (a === b) {
    return true
  }

  // Check for Uint8Array/Buffer comparison
  const aIsUint8Array =
    (typeof Buffer !== `undefined` && a instanceof Buffer) ||
    a instanceof Uint8Array
  const bIsUint8Array =
    (typeof Buffer !== `undefined` && b instanceof Buffer) ||
    b instanceof Uint8Array

  // If both are Uint8Arrays, compare by content
  if (aIsUint8Array && bIsUint8Array) {
    return areUint8ArraysEqual(a, b)
  }

  // Different types or not Uint8Arrays
  return false
}
