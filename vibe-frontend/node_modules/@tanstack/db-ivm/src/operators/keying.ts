import { map } from './map.js'
import type { PipedOperator } from '../types.js'

/**
 * Type for a keyed value
 */
export type Keyed<K, V> = [K, V]

/**
 * Takes an unkeyed input and returns a keyed result
 * @param keyFn - Function to generate the key for each value
 */
export function keyBy<T, K>(
  keyFn: (value: T) => K,
): PipedOperator<T, Keyed<K, T>> {
  return map((value: T): Keyed<K, T> => [keyFn(value), value])
}

/**
 * Removes the key from a keyed stream
 */
export function unkey<K, V>(): PipedOperator<Keyed<K, V>, V> {
  return map(([_, value]: Keyed<K, V>): V => value)
}

/**
 * Takes a keyed input and rekeys it with a new key
 * @param keyFn - Function to generate the new key for each value
 */
export function rekey<K1, K2, V>(
  keyFn: (value: V) => K2,
): PipedOperator<Keyed<K1, V>, Keyed<K2, V>> {
  return map(([_, value]: Keyed<K1, V>): Keyed<K2, V> => [keyFn(value), value])
}
