import { IStreamBuilder, KeyValue, PipedOperator } from '../types.js';
/**
 * Filters the elements of a keyed stream, by keys of another stream.
 * This allows you to build pipelies where you have multiple outputs that are related,
 * such as a streams of issues and comments for a project.
 *
 * @param other - The other stream to filter by, which must have the same key type as the input stream
 */
export declare function filterBy<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, T>(other: IStreamBuilder<KeyValue<K, unknown>>): PipedOperator<T, KeyValue<K, V1>>;
