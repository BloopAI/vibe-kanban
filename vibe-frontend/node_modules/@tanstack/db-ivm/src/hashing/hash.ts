import { MurmurHashStream, randomHash } from './murmur.js'
import type { Hasher } from './murmur.js'

/*
 * Implementation of structural hashing based on the Composites polyfill implementation:
 * https://github.com/tc39/proposal-composites
 */

const TRUE = randomHash()
const FALSE = randomHash()
const NULL = randomHash()
const UNDEFINED = randomHash()
const KEY = randomHash()
const FUNCTIONS = randomHash()
const DATE_MARKER = randomHash()
const OBJECT_MARKER = randomHash()
const ARRAY_MARKER = randomHash()
const MAP_MARKER = randomHash()
const SET_MARKER = randomHash()
const UINT8ARRAY_MARKER = randomHash()

// Maximum byte length for Uint8Arrays to hash by content instead of reference
// Arrays smaller than this will be hashed by content, allowing proper equality comparisons
// for small arrays like ULIDs (16 bytes) while still avoiding performance costs for large arrays
const UINT8ARRAY_CONTENT_HASH_THRESHOLD = 128

const hashCache = new WeakMap<object, number>()

export function hash(input: any): number {
  const hasher = new MurmurHashStream()
  updateHasher(hasher, input)
  return hasher.digest()
}

function hashObject(input: object): number {
  const cachedHash = hashCache.get(input)
  if (cachedHash !== undefined) {
    return cachedHash
  }

  let valueHash: number | undefined
  if (input instanceof Date) {
    valueHash = hashDate(input)
  } else if (
    // Check if input is a Uint8Array or Buffer
    (typeof Buffer !== `undefined` && input instanceof Buffer) ||
    input instanceof Uint8Array
  ) {
    // For small Uint8Arrays/Buffers (e.g., ULIDs, UUIDs), hash by content
    // to enable proper equality comparisons. For large arrays, hash by reference
    // to avoid performance costs.
    if (input.byteLength <= UINT8ARRAY_CONTENT_HASH_THRESHOLD) {
      valueHash = hashUint8Array(input)
    } else {
      // Deeply hashing large arrays would be too costly
      // so we track them by reference and cache them in a weak map
      return cachedReferenceHash(input)
    }
  } else if (input instanceof File) {
    // Files are always hashed by reference due to their potentially large size
    return cachedReferenceHash(input)
  } else {
    let plainObjectInput = input
    let marker = OBJECT_MARKER

    if (input instanceof Array) {
      marker = ARRAY_MARKER
    }

    if (input instanceof Map) {
      marker = MAP_MARKER
      plainObjectInput = [...input.entries()]
    }

    if (input instanceof Set) {
      marker = SET_MARKER
      plainObjectInput = [...input.entries()]
    }

    valueHash = hashPlainObject(plainObjectInput, marker)
  }

  hashCache.set(input, valueHash)
  return valueHash
}

function hashDate(input: Date): number {
  const hasher = new MurmurHashStream()
  hasher.update(DATE_MARKER)
  hasher.update(input.getTime())
  return hasher.digest()
}

function hashUint8Array(input: Uint8Array): number {
  const hasher = new MurmurHashStream()
  hasher.update(UINT8ARRAY_MARKER)
  // Hash the byte length first to differentiate arrays of different sizes
  hasher.update(input.byteLength)
  // Hash each byte in the array
  for (let i = 0; i < input.byteLength; i++) {
    hasher.writeByte(input[i]!)
  }
  return hasher.digest()
}

function hashPlainObject(input: object, marker: number): number {
  const hasher = new MurmurHashStream()

  // Mark the type of the input
  hasher.update(marker)
  const keys = Object.keys(input)
  keys.sort(keySort)
  for (const key of keys) {
    hasher.update(KEY)
    hasher.update(key)
    updateHasher(hasher, input[key as keyof typeof input])
  }

  return hasher.digest()
}

function updateHasher(hasher: Hasher, input: unknown): void {
  if (input === null) {
    hasher.update(NULL)
    return
  }
  switch (typeof input) {
    case `undefined`:
      hasher.update(UNDEFINED)
      return
    case `boolean`:
      hasher.update(input ? TRUE : FALSE)
      return
    case `number`:
      // Normalize NaNs and -0
      hasher.update(isNaN(input) ? NaN : input === 0 ? 0 : input)
      return
    case `bigint`:
    case `string`:
    case `symbol`:
      hasher.update(input)
      return
    case `object`:
      hasher.update(getCachedHash(input))
      return
    case `function`:
      // Functions are assigned a globally unique ID
      // and that ID is cached in the weak map
      hasher.update(cachedReferenceHash(input))
      return
    default:
      console.warn(
        `Ignored input during hashing because it is of type ${typeof input} which is not supported`,
      )
  }
}

function getCachedHash(input: object): number {
  let valueHash = hashCache.get(input)
  if (valueHash === undefined) {
    valueHash = hashObject(input)
  }
  return valueHash
}

let nextRefId = 1
function cachedReferenceHash(fn: object): number {
  let valueHash = hashCache.get(fn)
  if (valueHash === undefined) {
    valueHash = nextRefId ^ FUNCTIONS
    nextRefId++
    hashCache.set(fn, valueHash)
  }
  return valueHash
}

/**
 * Strings sorted lexicographically.
 */
function keySort(a: string, b: string): number {
  return a.localeCompare(b)
}
