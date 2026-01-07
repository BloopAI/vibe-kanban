import { TopKWithFractionalIndexOperator, IndexedValue, TopK, TopKWithFractionalIndexOptions } from './topKWithFractionalIndex.js';
import { PipedOperator } from '../types.js';
export declare function loadBTree(): Promise<void>;
/**
 * Operator for fractional indexed topK operations
 * This operator maintains fractional indices for sorted elements
 * and only updates indices when elements move position
 */
export declare class TopKWithFractionalIndexBTreeOperator<K extends string | number, T> extends TopKWithFractionalIndexOperator<K, T> {
    protected createTopK(offset: number, limit: number, comparator: (a: [K, T], b: [K, T]) => number): TopK<[K, T]>;
}
/**
 * Limits the number of results based on a comparator, with optional offset.
 * This works on a keyed stream, where the key is the first element of the tuple.
 * The ordering is within a key group, i.e. elements are sorted within a key group
 * and the limit + offset is applied to that sorted group.
 * To order the entire stream, key by the same value for all elements such as null.
 *
 * Uses fractional indexing to minimize the number of changes when elements move positions.
 * Each element is assigned a fractional index that is lexicographically sortable.
 * When elements move, only the indices of the moved elements are updated, not all elements.
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function topKWithFractionalIndexBTree<KType extends string | number, T>(comparator: (a: T, b: T) => number, options?: TopKWithFractionalIndexOptions): PipedOperator<[KType, T], [KType, IndexedValue<T>]>;
