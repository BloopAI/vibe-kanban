import { PropRef, BasicExpression, QueryIR } from '../ir.js';
import { CollectionSubscription } from '../../collection/subscription.js';
import { OrderByOptimizationInfo } from './order-by.js';
import { LazyCollectionCallbacks } from './joins.js';
import { Collection } from '../../collection/index.js';
import { KeyedStream, ResultStream } from '../../types.js';
import { QueryCache, QueryMapping, WindowOptions } from './types.js';
export type { WindowOptions } from './types.js';
/**
 * Result of query compilation including both the pipeline and source-specific WHERE clauses
 */
export interface CompilationResult {
    /** The ID of the main collection */
    collectionId: string;
    /** The compiled query pipeline (D2 stream) */
    pipeline: ResultStream;
    /** Map of source aliases to their WHERE clauses for index optimization */
    sourceWhereClauses: Map<string, BasicExpression<boolean>>;
    /**
     * Maps each source alias to its collection ID. Enables per-alias subscriptions for self-joins.
     * Example: `{ employee: 'employees-col-id', manager: 'employees-col-id' }`
     */
    aliasToCollectionId: Record<string, string>;
    /**
     * Flattened mapping from outer alias to innermost alias for subqueries.
     * Always provides one-hop lookups, never recursive chains.
     *
     * Example: `{ activeUser: 'user' }` when `.from({ activeUser: subquery })`
     * where the subquery uses `.from({ user: collection })`.
     *
     * For deeply nested subqueries, the mapping goes directly to the innermost alias:
     * `{ author: 'user' }` (not `{ author: 'activeUser' }`), so `aliasRemapping[alias]`
     * always resolves in a single lookup.
     *
     * Used to resolve subscriptions during lazy loading when join aliases differ from
     * the inner aliases where collection subscriptions were created.
     */
    aliasRemapping: Record<string, string>;
}
/**
 * Compiles a query IR into a D2 pipeline
 * @param rawQuery The query IR to compile
 * @param inputs Mapping of source aliases to input streams (e.g., `{ employee: input1, manager: input2 }`)
 * @param collections Mapping of collection IDs to Collection instances
 * @param subscriptions Mapping of source aliases to CollectionSubscription instances
 * @param callbacks Mapping of source aliases to lazy loading callbacks
 * @param lazySources Set of source aliases that should load data lazily
 * @param optimizableOrderByCollections Map of collection IDs to order-by optimization info
 * @param cache Optional cache for compiled subqueries (used internally for recursion)
 * @param queryMapping Optional mapping from optimized queries to original queries
 * @returns A CompilationResult with the pipeline, source WHERE clauses, and alias metadata
 */
export declare function compileQuery(rawQuery: QueryIR, inputs: Record<string, KeyedStream>, collections: Record<string, Collection<any, any, any, any, any>>, subscriptions: Record<string, CollectionSubscription>, callbacks: Record<string, LazyCollectionCallbacks>, lazySources: Set<string>, optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>, setWindowFn: (windowFn: (options: WindowOptions) => void) => void, cache?: QueryCache, queryMapping?: QueryMapping): CompilationResult;
/**
 * Follows the given reference in a query
 * until its finds the root field the reference points to.
 * @returns The collection, its alias, and the path to the root field in this collection
 */
export declare function followRef(query: QueryIR, ref: PropRef<any>, collection: Collection): {
    collection: Collection;
    path: Array<string>;
} | void;
export type CompileQueryFn = typeof compileQuery;
