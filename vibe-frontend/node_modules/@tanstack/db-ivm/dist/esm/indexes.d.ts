import { MultiSet } from './multiset.js';
type SingleValue<TValue> = [TValue, number];
/**
 * A map from a difference collection trace's keys -> (value, multiplicities) that changed.
 * Used in operations like join and reduce where the operation needs to
 * exploit the key-value structure of the data to run efficiently.
 */
export declare class Index<TKey, TValue, TPrefix = any> {
    #private;
    constructor();
    /**
     * Create an Index from multiple MultiSet messages.
     * @param messages - Array of MultiSet messages to build the index from.
     * @returns A new Index containing all the data from the messages.
     */
    static fromMultiSets<K, V>(messages: Array<MultiSet<[K, V]>>): Index<K, V>;
    /**
     * This method returns a string representation of the index.
     * @param indent - Whether to indent the string representation.
     * @returns A string representation of the index.
     */
    toString(indent?: boolean): string;
    /**
     * The size of the index.
     */
    get size(): number;
    /**
     * This method checks if the index has a given key.
     * @param key - The key to check.
     * @returns True if the index has the key, false otherwise.
     */
    has(key: TKey): boolean;
    /**
     * Check if a key has presence (non-zero consolidated multiplicity).
     * @param key - The key to check.
     * @returns True if the key has non-zero consolidated multiplicity, false otherwise.
     */
    hasPresence(key: TKey): boolean;
    /**
     * Get the consolidated multiplicity (sum of multiplicities) for a key.
     * @param key - The key to get the consolidated multiplicity for.
     * @returns The consolidated multiplicity for the key.
     */
    getConsolidatedMultiplicity(key: TKey): number;
    /**
     * Get all keys that have presence (non-zero consolidated multiplicity).
     * @returns An iterator of keys with non-zero consolidated multiplicity.
     */
    getPresenceKeys(): Iterable<TKey>;
    /**
     * This method returns all values for a given key.
     * @param key - The key to get the values for.
     * @returns An array of value tuples [value, multiplicity].
     */
    get(key: TKey): Array<[TValue, number]>;
    /**
     * This method returns an iterator over all values for a given key.
     * @param key - The key to get the values for.
     * @returns An iterator of value tuples [value, multiplicity].
     */
    getIterator(key: TKey): Iterable<[TValue, number]>;
    /**
     * This returns an iterator that iterates over all key-value pairs.
     * @returns An iterable of all key-value pairs (and their multiplicities) in the index.
     */
    entries(): Iterable<[TKey, [TValue, number]]>;
    /**
     * This method only iterates over the keys and not over the values.
     * Hence, it is more efficient than the `#entries` method.
     * It returns an iterator that you can use if you need to iterate over the values for a given key.
     * @returns An iterator of all *keys* in the index and their corresponding value iterator.
     */
    entriesIterators(): Iterable<[TKey, Iterable<[TValue, number]>]>;
    /**
     * This method adds a value to the index.
     * @param key - The key to add the value to.
     * @param valueTuple - The value tuple [value, multiplicity] to add to the index.
     */
    addValue(key: TKey, valueTuple: SingleValue<TValue>): void;
    /**
     * This method appends another index to the current index.
     * @param other - The index to append to the current index.
     */
    append(other: Index<TKey, TValue>): void;
    /**
     * This method joins two indexes.
     * @param other - The index to join with the current index.
     * @returns A multiset of the joined values.
     */
    join<TValue2>(other: Index<TKey, TValue2>): MultiSet<[TKey, [TValue, TValue2]]>;
}
export {};
