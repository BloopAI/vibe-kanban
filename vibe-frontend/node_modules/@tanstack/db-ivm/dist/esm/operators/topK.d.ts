import { KeyValue, PipedOperator } from '../types.js';
interface TopKOptions {
    limit?: number;
    offset?: number;
}
/**
 * Limits the number of results based on a comparator, with optional offset.
 * This works on a keyed stream, where the key is the first element of the tuple
 * The ordering is withing a key group, i.e. elements are sorted within a key group
 * and the limit + offset is applied to that sorted group.
 * To order the entire stream, key by the same value for all elements such as null.
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that limits the number of results
 */
export declare function topK<KType extends T extends KeyValue<infer K, infer _V> ? K : never, V1Type extends T extends KeyValue<KType, infer V> ? V : never, T>(comparator: (a: V1Type, b: V1Type) => number, options?: TopKOptions): PipedOperator<T, T>;
/**
 * Limits the number of results based on a comparator, with optional offset.
 * This works on a keyed stream, where the key is the first element of the tuple
 * The ordering is withing a key group, i.e. elements are sorted within a key group
 * and the limit + offset is applied to that sorted group.
 * To order the entire stream, key by the same value for all elements such as null.
 * Adds the index of the element to the result as [key, [value, index]]
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function topKWithIndex<KType extends T extends KeyValue<infer K, infer _V> ? K : never, V1Type extends T extends KeyValue<KType, infer V> ? V : never, T>(comparator: (a: V1Type, b: V1Type) => number, options?: TopKOptions): PipedOperator<T, KeyValue<KType, [V1Type, number]>>;
export {};
