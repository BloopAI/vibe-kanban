import { IStreamBuilder, KeyValue } from '../types.js';
type GroupKey = Record<string, unknown>;
type BasicAggregateFunction<T, R, V = unknown> = {
    preMap: (data: T) => V;
    reduce: (values: Array<[V, number]>) => V;
    postMap?: (result: V) => R;
};
type PipedAggregateFunction<T, R> = {
    pipe: (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<string, R>>;
};
type AggregateFunction<T, R, V = unknown> = BasicAggregateFunction<T, R, V> | PipedAggregateFunction<T, R>;
type ExtractAggregateReturnType<T, A> = A extends AggregateFunction<T, infer R, any> ? R : never;
type AggregatesReturnType<T, A> = {
    [K in keyof A]: ExtractAggregateReturnType<T, A[K]>;
};
/**
 * Groups data by key and applies multiple aggregate operations
 * @param keyExtractor Function to extract grouping key from data
 * @param aggregates Object mapping aggregate names to aggregate functions
 */
export declare function groupBy<T, K extends GroupKey, A extends Record<string, AggregateFunction<T, any, any>>>(keyExtractor: (data: T) => K, aggregates?: A): (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<string, K & AggregatesReturnType<T, A>>>;
/**
 * Creates a sum aggregate function
 */
export declare function sum<T>(valueExtractor?: (value: T) => number): AggregateFunction<T, number, number>;
/**
 * Creates a count aggregate function
 */
export declare function count<T>(valueExtractor?: (value: T) => any): AggregateFunction<T, number, number>;
/**
 * Creates an average aggregate function
 */
export declare function avg<T>(valueExtractor?: (value: T) => number): AggregateFunction<T, number, {
    sum: number;
    count: number;
}>;
type CanMinMax = number | Date | bigint;
/**
 * Creates a min aggregate function that computes the minimum value in a group
 * @param valueExtractor Function to extract a comparable value from each data entry
 */
export declare function min<T extends CanMinMax>(): AggregateFunction<T, T | undefined, T | undefined>;
export declare function min<T, V extends CanMinMax>(valueExtractor: (value: T) => V): AggregateFunction<T, V | undefined, V | undefined>;
/**
 * Creates a max aggregate function that computes the maximum value in a group
 * @param valueExtractor Function to extract a comparable value from each data entry
 */
export declare function max<T extends CanMinMax>(): AggregateFunction<T, T | undefined, T | undefined>;
export declare function max<T, V extends CanMinMax>(valueExtractor: (value: T) => V): AggregateFunction<T, V | undefined, V | undefined>;
/**
 * Creates a median aggregate function that computes the middle value in a sorted group
 * If there's an even number of values, returns the average of the two middle values
 * @param valueExtractor Function to extract a numeric value from each data entry
 */
export declare function median<T>(valueExtractor?: (value: T) => number): AggregateFunction<T, number, Array<number>>;
/**
 * Creates a mode aggregate function that computes the most frequent value in a group
 * If multiple values have the same highest frequency, returns the first one encountered
 * @param valueExtractor Function to extract a value from each data entry
 */
export declare function mode<T>(valueExtractor?: (value: T) => number): AggregateFunction<T, number, Map<number, number>>;
export declare const groupByOperators: {
    sum: typeof sum;
    count: typeof count;
    avg: typeof avg;
    min: typeof min;
    max: typeof max;
    median: typeof median;
    mode: typeof mode;
};
export {};
