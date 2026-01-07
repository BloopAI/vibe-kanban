import { BaseIndex, IndexOperation } from './base-index.js';
import { CompareOptions } from '../query/builder/types.js';
import { BasicExpression } from '../query/ir.js';
/**
 * Options for Ordered index
 */
export interface BTreeIndexOptions {
    compareFn?: (a: any, b: any) => number;
    compareOptions?: CompareOptions;
}
/**
 * Options for range queries
 */
export interface RangeQueryOptions {
    from?: any;
    to?: any;
    fromInclusive?: boolean;
    toInclusive?: boolean;
}
/**
 * B+Tree index for sorted data with range queries
 * This maintains items in sorted order and provides efficient range operations
 */
export declare class BTreeIndex<TKey extends string | number = string | number> extends BaseIndex<TKey> {
    readonly supportedOperations: Set<"eq" | "gt" | "gte" | "lt" | "lte" | "in" | "like" | "ilike">;
    private orderedEntries;
    private valueMap;
    private indexedKeys;
    private compareFn;
    constructor(id: number, expression: BasicExpression, name?: string, options?: any);
    protected initialize(_options?: BTreeIndexOptions): void;
    /**
     * Adds a value to the index
     */
    add(key: TKey, item: any): void;
    /**
     * Removes a value from the index
     */
    remove(key: TKey, item: any): void;
    /**
     * Updates a value in the index
     */
    update(key: TKey, oldItem: any, newItem: any): void;
    /**
     * Builds the index from a collection of entries
     */
    build(entries: Iterable<[TKey, any]>): void;
    /**
     * Clears all data from the index
     */
    clear(): void;
    /**
     * Performs a lookup operation
     */
    lookup(operation: IndexOperation, value: any): Set<TKey>;
    /**
     * Gets the number of indexed keys
     */
    get keyCount(): number;
    /**
     * Performs an equality lookup
     */
    equalityLookup(value: any): Set<TKey>;
    /**
     * Performs a range query with options
     * This is more efficient for compound queries like "WHERE a > 5 AND a < 10"
     */
    rangeQuery(options?: RangeQueryOptions): Set<TKey>;
    /**
     * Performs a reversed range query
     */
    rangeQueryReversed(options?: RangeQueryOptions): Set<TKey>;
    private takeInternal;
    /**
     * Returns the next n items after the provided item or the first n items if no from item is provided.
     * @param n - The number of items to return
     * @param from - The item to start from (exclusive). Starts from the smallest item (inclusive) if not provided.
     * @returns The next n items after the provided key. Returns the first n items if no from item is provided.
     */
    take(n: number, from?: any, filterFn?: (key: TKey) => boolean): Array<TKey>;
    /**
     * Returns the next n items **before** the provided item (in descending order) or the last n items if no from item is provided.
     * @param n - The number of items to return
     * @param from - The item to start from (exclusive). Starts from the largest item (inclusive) if not provided.
     * @returns The next n items **before** the provided key. Returns the last n items if no from item is provided.
     */
    takeReversed(n: number, from?: any, filterFn?: (key: TKey) => boolean): Array<TKey>;
    /**
     * Performs an IN array lookup
     */
    inArrayLookup(values: Array<any>): Set<TKey>;
    get indexedKeysSet(): Set<TKey>;
    get orderedEntriesArray(): Array<[any, Set<TKey>]>;
    get orderedEntriesArrayReversed(): Array<[any, Set<TKey>]>;
    get valueMapData(): Map<any, Set<TKey>>;
}
