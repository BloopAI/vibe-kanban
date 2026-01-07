import { PipedOperator } from '../types.js';
/**
 * Type for a keyed value
 */
export type Keyed<K, V> = [K, V];
/**
 * Takes an unkeyed input and returns a keyed result
 * @param keyFn - Function to generate the key for each value
 */
export declare function keyBy<T, K>(keyFn: (value: T) => K): PipedOperator<T, Keyed<K, T>>;
/**
 * Removes the key from a keyed stream
 */
export declare function unkey<K, V>(): PipedOperator<Keyed<K, V>, V>;
/**
 * Takes a keyed input and rekeys it with a new key
 * @param keyFn - Function to generate the new key for each value
 */
export declare function rekey<K1, K2, V>(keyFn: (value: V) => K2): PipedOperator<Keyed<K1, V>, Keyed<K2, V>>;
