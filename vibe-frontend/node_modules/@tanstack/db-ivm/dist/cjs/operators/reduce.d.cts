import { DifferenceStreamWriter, UnaryOperator, DifferenceStreamReader } from '../graph.js';
import { IStreamBuilder, KeyValue } from '../types.js';
/**
 * Base operator for reduction operations (version-free)
 */
export declare class ReduceOperator<K, V1, V2> extends UnaryOperator<[K, V1], [K, V2]> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<[K, V1]>, output: DifferenceStreamWriter<[K, V2]>, f: (values: Array<[V1, number]>) => Array<[V2, number]>);
    run(): void;
}
/**
 * Reduces the elements in the stream by key (version-free)
 */
export declare function reduce<KType extends T extends KeyValue<infer K, infer _V> ? K : never, V1Type extends T extends KeyValue<KType, infer V> ? V : never, R, T>(f: (values: Array<[V1Type, number]>) => Array<[R, number]>): (stream: IStreamBuilder<T>) => IStreamBuilder<KeyValue<KType, R>>;
