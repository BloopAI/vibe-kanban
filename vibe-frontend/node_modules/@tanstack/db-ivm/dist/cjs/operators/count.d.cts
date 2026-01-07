import { DifferenceStreamWriter, DifferenceStreamReader } from '../graph.js';
import { ReduceOperator } from './reduce.js';
import { IStreamBuilder, KeyValue } from '../types.js';
/**
 * Operator that counts elements by key (version-free)
 */
export declare class CountOperator<K, V> extends ReduceOperator<K, V, number> {
    constructor(id: number, inputA: DifferenceStreamReader<[K, V]>, output: DifferenceStreamWriter<[K, number]>);
}
/**
 * Counts the number of elements by key (version-free)
 */
export declare function count<KType extends T extends KeyValue<infer K, infer _V> ? K : never, VType extends T extends KeyValue<KType, infer V> ? V : never, T>(): (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<KType, number>>;
