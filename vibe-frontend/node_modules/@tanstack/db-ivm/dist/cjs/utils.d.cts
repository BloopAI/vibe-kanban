/**
 * Simple assertion function for runtime checks.
 * Throws an error if the condition is false.
 */
export declare function assert(condition: unknown, message?: string): asserts condition;
/**
 * A map that returns a default value for keys that are not present.
 */
export declare class DefaultMap<K, V> extends Map<K, V> {
    private defaultValue;
    constructor(defaultValue: () => V, entries?: Iterable<[K, V]>);
    get(key: K): V;
    /**
     * Update the value for a key using a function.
     */
    update(key: K, updater: (value: V) => V): V;
}
export declare function chunkedArrayPush(array: Array<unknown>, other: Array<unknown>): void;
export declare function binarySearch<T>(array: Array<T>, value: T, comparator: (a: T, b: T) => number): number;
/**
 * Utility for generating unique IDs for objects and values.
 * Uses WeakMap for object reference tracking and consistent hashing for primitives.
 */
export declare class ObjectIdGenerator {
    private objectIds;
    private nextId;
    /**
     * Get a unique identifier for any value.
     * - Objects: Uses WeakMap for reference-based identity
     * - Primitives: Uses consistent string-based hashing
     */
    getId(value: any): number;
    /**
     * Get a string representation of the ID for use in composite keys.
     */
    getStringId(value: any): string;
}
/**
 * Global instance for cases where a shared object ID space is needed.
 */
export declare const globalObjectIdGenerator: ObjectIdGenerator;
export declare function concatIterable<T>(...iterables: Array<Iterable<T>>): Iterable<T>;
export declare function mapIterable<T, U>(it: Iterable<T>, fn: (t: T) => U): Iterable<U>;
export type HRange = [number, number];
/**
 * Computes the difference between two half-open ranges.
 * @param a - The first half-open range
 * @param b - The second half-open range
 * @returns The difference between the two ranges
 */
export declare function diffHalfOpen(a: HRange, b: HRange): {
    onlyInA: number[];
    onlyInB: number[];
};
/**
 * Compares two keys (string | number) in a consistent, deterministic way.
 * Handles mixed types by ordering strings before numbers.
 */
export declare function compareKeys(a: string | number, b: string | number): number;
