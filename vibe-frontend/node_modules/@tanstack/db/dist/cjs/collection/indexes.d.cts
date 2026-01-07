import { IndexProxy, LazyIndexWrapper } from '../indexes/lazy-index.cjs';
import { BTreeIndex } from '../indexes/btree-index.cjs';
import { StandardSchemaV1 } from '@standard-schema/spec';
import { BaseIndex, IndexResolver } from '../indexes/base-index.cjs';
import { ChangeMessage } from '../types.cjs';
import { IndexOptions } from '../indexes/index-options.cjs';
import { SingleRowRefProxy } from '../query/builder/ref-proxy.cjs';
import { CollectionLifecycleManager } from './lifecycle.cjs';
import { CollectionStateManager } from './state.cjs';
export declare class CollectionIndexesManager<TOutput extends object = Record<string, unknown>, TKey extends string | number = string | number, TSchema extends StandardSchemaV1 = StandardSchemaV1, TInput extends object = TOutput> {
    private lifecycle;
    private state;
    lazyIndexes: Map<number, LazyIndexWrapper<TKey>>;
    resolvedIndexes: Map<number, BaseIndex<TKey>>;
    isIndexesResolved: boolean;
    indexCounter: number;
    constructor();
    setDeps(deps: {
        state: CollectionStateManager<TOutput, TKey, TSchema, TInput>;
        lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>;
    }): void;
    /**
     * Creates an index on a collection for faster queries.
     */
    createIndex<TResolver extends IndexResolver<TKey> = typeof BTreeIndex>(indexCallback: (row: SingleRowRefProxy<TOutput>) => any, config?: IndexOptions<TResolver>): IndexProxy<TKey>;
    /**
     * Resolve all lazy indexes (called when collection first syncs)
     */
    resolveAllIndexes(): Promise<void>;
    /**
     * Resolve a single index immediately
     */
    private resolveSingleIndex;
    /**
     * Get resolved indexes for query optimization
     */
    get indexes(): Map<number, BaseIndex<TKey>>;
    /**
     * Updates all indexes when the collection changes
     */
    updateIndexes(changes: Array<ChangeMessage<TOutput, TKey>>): void;
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup(): void;
}
