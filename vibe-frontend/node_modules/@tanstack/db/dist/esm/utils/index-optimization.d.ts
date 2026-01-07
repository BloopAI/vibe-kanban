import { CompareOptions } from '../query/builder/types.js';
import { IndexInterface } from '../indexes/base-index.js';
import { BasicExpression } from '../query/ir.js';
import { CollectionLike } from '../types.js';
/**
 * Result of index-based query optimization
 */
export interface OptimizationResult<TKey> {
    canOptimize: boolean;
    matchingKeys: Set<TKey>;
}
/**
 * Finds an index that matches a given field path
 */
export declare function findIndexForField<TKey extends string | number>(collection: CollectionLike<any, TKey>, fieldPath: Array<string>, compareOptions?: CompareOptions): IndexInterface<TKey> | undefined;
/**
 * Intersects multiple sets (AND logic)
 */
export declare function intersectSets<T>(sets: Array<Set<T>>): Set<T>;
/**
 * Unions multiple sets (OR logic)
 */
export declare function unionSets<T>(sets: Array<Set<T>>): Set<T>;
/**
 * Optimizes a query expression using available indexes to find matching keys
 */
export declare function optimizeExpressionWithIndexes<T extends object, TKey extends string | number>(expression: BasicExpression, collection: CollectionLike<T, TKey>): OptimizationResult<TKey>;
/**
 * Checks if an expression can be optimized
 */
export declare function canOptimizeExpression<T extends object, TKey extends string | number>(expression: BasicExpression, collection: CollectionLike<T, TKey>): boolean;
