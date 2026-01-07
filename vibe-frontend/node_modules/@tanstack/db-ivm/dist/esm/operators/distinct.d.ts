import { DifferenceStreamWriter, UnaryOperator, DifferenceStreamReader } from '../graph.js';
import { IStreamBuilder, KeyValue } from '../types.js';
type GetValue<T> = T extends KeyValue<any, infer V> ? V : never;
/**
 * Operator that removes duplicates
 */
export declare class DistinctOperator<T extends KeyValue<any, any>> extends UnaryOperator<T, KeyValue<number, GetValue<T>>> {
    #private;
    constructor(id: number, input: DifferenceStreamReader<T>, output: DifferenceStreamWriter<KeyValue<number, GetValue<T>>>, by?: (value: T) => any);
    run(): void;
}
/**
 * Removes duplicate values
 */
export declare function distinct<T extends KeyValue<any, any>>(by?: (value: T) => any): (stream: IStreamBuilder<T>) => IStreamBuilder<T>;
export {};
