import { DifferenceStreamWriter, UnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
/**
 * Operator that logs debug information about the stream
 */
export declare class DebugOperator<T> extends UnaryOperator<T> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<T>, output: DifferenceStreamWriter<T>, name: string, indent?: boolean);
    run(): void;
}
/**
 * Logs debug information about the stream using console.log
 * @param name - The name to prefix debug messages with
 * @param indent - Whether to indent the debug output
 */
export declare function debug<T>(name: string, indent?: boolean): PipedOperator<T, T>;
