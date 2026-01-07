import { topKWithFractionalIndex } from './topKWithFractionalIndex.js';
import { IStreamBuilder, KeyValue } from '../types.js';
export interface OrderByOptions<Ve> {
    comparator?: (a: Ve, b: Ve) => number;
    limit?: number;
    offset?: number;
}
type OrderByWithFractionalIndexOptions<Ve> = OrderByOptions<Ve> & {
    setSizeCallback?: (getSize: () => number) => void;
    setWindowFn?: (windowFn: (options: {
        offset?: number;
        limit?: number;
    }) => void) => void;
};
/**
 * Orders the elements and limits the number of results, with optional offset
 * This requires a keyed stream, and uses the `topK` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function orderBy<T extends KeyValue<unknown, unknown>, Ve = unknown>(valueExtractor: (value: T extends KeyValue<unknown, infer V> ? V : never) => Ve, options?: OrderByOptions<Ve>): (stream: IStreamBuilder<T>) => IStreamBuilder<T>;
/**
 * Orders the elements and limits the number of results, with optional offset and
 * annotates the value with the index.
 * This requires a keyed stream, and uses the `topKWithIndex` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function orderByWithIndex<T extends KeyValue<unknown, unknown>, Ve = unknown>(valueExtractor: (value: T extends KeyValue<unknown, infer V> ? V : never) => Ve, options?: OrderByOptions<Ve>): (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<T extends KeyValue<infer K, unknown> ? K : never, [T extends KeyValue<unknown, infer V> ? V : never, number]>>;
export declare function orderByWithFractionalIndexBase<T extends KeyValue<unknown, unknown>, Ve = unknown>(topKFunction: typeof topKWithFractionalIndex, valueExtractor: (value: T extends KeyValue<unknown, infer V> ? V : never) => Ve, options?: OrderByWithFractionalIndexOptions<Ve>): (stream: IStreamBuilder<T>) => IStreamBuilder<[T extends KeyValue<infer K, unknown> ? K : never, [T extends KeyValue<unknown, infer V> ? V : never, string]]>;
/**
 * Orders the elements and limits the number of results, with optional offset and
 * annotates the value with a fractional index.
 * This requires a keyed stream, and uses the `topKWithFractionalIndex` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function orderByWithFractionalIndex<T extends KeyValue<unknown, unknown>, Ve = unknown>(valueExtractor: (value: T extends KeyValue<unknown, infer V> ? V : never) => Ve, options?: OrderByWithFractionalIndexOptions<Ve>): (stream: IStreamBuilder<T>) => IStreamBuilder<[T extends KeyValue<infer K, unknown> ? K : never, [T extends KeyValue<unknown, infer V> ? V : never, string]]>;
export {};
