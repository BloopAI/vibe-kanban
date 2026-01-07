/**
 * A Map implementation that keeps its entries sorted based on a comparator function
 * @template TKey - The type of keys in the map (must be string | number)
 * @template TValue - The type of values in the map
 */
export declare class SortedMap<TKey extends string | number, TValue> {
    private map;
    private sortedKeys;
    private comparator;
    /**
     * Creates a new SortedMap instance
     *
     * @param comparator - Optional function to compare values for sorting.
     *                     If not provided, entries are sorted by key only.
     */
    constructor(comparator?: (a: TValue, b: TValue) => number);
    /**
     * Finds the index where a key-value pair should be inserted to maintain sort order.
     * Uses binary search to find the correct position based on the value (if comparator provided),
     * with key-based tie-breaking for deterministic ordering when values compare as equal.
     * If no comparator is provided, sorts by key only.
     * Runs in O(log n) time.
     *
     * @param key - The key to find position for (used as tie-breaker or primary sort when no comparator)
     * @param value - The value to compare against (only used if comparator is provided)
     * @returns The index where the key should be inserted
     */
    private indexOf;
    /**
     * Sets a key-value pair in the map and maintains sort order
     *
     * @param key - The key to set
     * @param value - The value to associate with the key
     * @returns This SortedMap instance for chaining
     */
    set(key: TKey, value: TValue): this;
    /**
     * Gets a value by its key
     *
     * @param key - The key to look up
     * @returns The value associated with the key, or undefined if not found
     */
    get(key: TKey): TValue | undefined;
    /**
     * Removes a key-value pair from the map
     *
     * @param key - The key to remove
     * @returns True if the key was found and removed, false otherwise
     */
    delete(key: TKey): boolean;
    /**
     * Checks if a key exists in the map
     *
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    has(key: TKey): boolean;
    /**
     * Removes all key-value pairs from the map
     */
    clear(): void;
    /**
     * Gets the number of key-value pairs in the map
     */
    get size(): number;
    /**
     * Default iterator that returns entries in sorted order
     *
     * @returns An iterator for the map's entries
     */
    [Symbol.iterator](): IterableIterator<[TKey, TValue]>;
    /**
     * Returns an iterator for the map's entries in sorted order
     *
     * @returns An iterator for the map's entries
     */
    entries(): IterableIterator<[TKey, TValue]>;
    /**
     * Returns an iterator for the map's keys in sorted order
     *
     * @returns An iterator for the map's keys
     */
    keys(): IterableIterator<TKey>;
    /**
     * Returns an iterator for the map's values in sorted order
     *
     * @returns An iterator for the map's values
     */
    values(): IterableIterator<TValue>;
    /**
     * Executes a callback function for each key-value pair in the map in sorted order
     *
     * @param callbackfn - Function to execute for each entry
     */
    forEach(callbackfn: (value: TValue, key: TKey, map: Map<TKey, TValue>) => void): void;
}
