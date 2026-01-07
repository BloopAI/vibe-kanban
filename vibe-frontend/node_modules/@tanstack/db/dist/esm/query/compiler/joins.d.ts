import { CompileQueryFn } from './index.js';
import { OrderByOptimizationInfo } from './order-by.js';
import { JoinClause, QueryIR } from '../ir.js';
import { Collection } from '../../collection/index.js';
import { KeyedStream, NamespacedAndKeyedStream } from '../../types.js';
import { QueryCache, QueryMapping, WindowOptions } from './types.js';
import { CollectionSubscription } from '../../collection/subscription.js';
/** Function type for loading specific keys into a lazy collection */
export type LoadKeysFn = (key: Set<string | number>) => void;
/** Callbacks for managing lazy-loaded collections in optimized joins */
export type LazyCollectionCallbacks = {
    loadKeys: LoadKeysFn;
    loadInitialState: () => void;
};
/**
 * Processes all join clauses, applying lazy loading optimizations and maintaining
 * alias tracking for per-alias subscriptions (enables self-joins).
 */
export declare function processJoins(pipeline: NamespacedAndKeyedStream, joinClauses: Array<JoinClause>, sources: Record<string, KeyedStream>, mainCollectionId: string, mainSource: string, allInputs: Record<string, KeyedStream>, cache: QueryCache, queryMapping: QueryMapping, collections: Record<string, Collection>, subscriptions: Record<string, CollectionSubscription>, callbacks: Record<string, LazyCollectionCallbacks>, lazySources: Set<string>, optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>, setWindowFn: (windowFn: (options: WindowOptions) => void) => void, rawQuery: QueryIR, onCompileSubquery: CompileQueryFn, aliasToCollectionId: Record<string, string>, aliasRemapping: Record<string, string>): NamespacedAndKeyedStream;
