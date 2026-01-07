import { DifferenceStreamWriter, UnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
import { MultiSet } from '../multiset.js';
/**
 * Operator that outputs the messages in the stream
 */
export declare class OutputOperator<T> extends UnaryOperator<T> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<T>, outputWriter: DifferenceStreamWriter<T>, fn: (data: MultiSet<T>) => void);
    run(): void;
}
/**
 * Outputs the messages in the stream
 * @param fn - The function to call with each message
 */
export declare function output<T>(fn: (data: MultiSet<T>) => void): PipedOperator<T, T>;
