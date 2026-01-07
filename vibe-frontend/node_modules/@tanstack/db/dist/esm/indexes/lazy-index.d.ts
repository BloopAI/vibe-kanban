import { BaseIndex, IndexResolver } from './base-index.js';
import { BasicExpression } from '../query/ir.js';
/**
 * Wrapper that defers index creation until first sync
 */
export declare class LazyIndexWrapper<TKey extends string | number = string | number> {
    private id;
    private expression;
    private name;
    private resolver;
    private options;
    private collectionEntries?;
    private indexPromise;
    private resolvedIndex;
    constructor(id: number, expression: BasicExpression, name: string | undefined, resolver: IndexResolver<TKey>, options: any, collectionEntries?: Iterable<[TKey, any]> | undefined);
    /**
     * Resolve the actual index
     */
    resolve(): Promise<BaseIndex<TKey>>;
    /**
     * Check if already resolved
     */
    isResolved(): boolean;
    /**
     * Get resolved index (throws if not ready)
     */
    getResolved(): BaseIndex<TKey>;
    /**
     * Get the index ID
     */
    getId(): number;
    /**
     * Get the index name
     */
    getName(): string | undefined;
    /**
     * Get the index expression
     */
    getExpression(): BasicExpression;
    private createIndex;
}
/**
 * Proxy that provides synchronous interface while index loads asynchronously
 */
export declare class IndexProxy<TKey extends string | number = string | number> {
    private indexId;
    private lazyIndex;
    constructor(indexId: number, lazyIndex: LazyIndexWrapper<TKey>);
    /**
     * Get the resolved index (throws if not ready)
     */
    get index(): BaseIndex<TKey>;
    /**
     * Check if index is ready
     */
    get isReady(): boolean;
    /**
     * Wait for index to be ready
     */
    whenReady(): Promise<BaseIndex<TKey>>;
    /**
     * Get the index ID
     */
    get id(): number;
    /**
     * Get the index name (throws if not ready)
     */
    get name(): string | undefined;
    /**
     * Get the index expression (available immediately)
     */
    get expression(): BasicExpression;
    /**
     * Check if index supports an operation (throws if not ready)
     */
    supports(operation: any): boolean;
    /**
     * Get index statistics (throws if not ready)
     */
    getStats(): import('./base-index.js').IndexStats;
    /**
     * Check if index matches a field path (available immediately)
     */
    matchesField(fieldPath: Array<string>): boolean;
    /**
     * Get the key count (throws if not ready)
     */
    get keyCount(): number;
    get indexedKeysSet(): Set<TKey>;
    get orderedEntriesArray(): Array<[any, Set<TKey>]>;
    get valueMapData(): Map<any, Set<TKey>>;
    equalityLookup(value: any): Set<TKey>;
    rangeQuery(options: any): Set<TKey>;
    inArrayLookup(values: Array<any>): Set<TKey>;
    _getLazyWrapper(): LazyIndexWrapper<TKey>;
}
