import { DifferenceStreamWriter, LinearUnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
import { MultiSet } from '../multiset.js';
/**
 * Operator that applies a function to each multi-set in the input stream
 */
export declare class TapOperator<T> extends LinearUnaryOperator<T, T> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<T>, output: DifferenceStreamWriter<T>, f: (data: MultiSet<T>) => void);
    inner(collection: MultiSet<T>): MultiSet<T>;
}
/**
 * Invokes a function for each multi-set in the input stream.
 * This operator doesn't modify the stream and is used to perform side effects.
 * @param f - The function to invoke on each multi-set
 * @returns The input stream
 */
export declare function tap<T>(f: (data: MultiSet<T>) => void): PipedOperator<T, T>;
