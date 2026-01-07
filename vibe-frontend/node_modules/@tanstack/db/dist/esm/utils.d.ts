import { CompareOptions } from './query/builder/types.js';
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
export declare function deepEquals(a: any, b: any): boolean;
/** Checks if the value is a Temporal object by checking for the Temporal brand */
export declare function isTemporal(a: any): boolean;
export declare const DEFAULT_COMPARE_OPTIONS: CompareOptions;
