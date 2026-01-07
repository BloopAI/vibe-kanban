import { DifferenceStreamWriter, LinearUnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
import { MultiSet } from '../multiset.js';
/**
 * Operator that applies a function to each element in the input stream
 */
export declare class MapOperator<T, U> extends LinearUnaryOperator<T, U> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<T>, output: DifferenceStreamWriter<U>, f: (data: T) => U);
    inner(collection: MultiSet<T>): MultiSet<U>;
}
/**
 * Applies a function to each element in the input stream
 * @param f - The function to apply to each element
 */
export declare function map<T, O>(f: (data: T) => O): PipedOperator<T, O>;
