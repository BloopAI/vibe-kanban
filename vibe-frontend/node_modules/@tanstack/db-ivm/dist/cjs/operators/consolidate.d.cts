import { UnaryOperator } from '../graph.js';
import { PipedOperator } from '../types.js';
/**
 * Operator that consolidates collections
 */
export declare class ConsolidateOperator<T> extends UnaryOperator<T> {
    run(): void;
}
/**
 * Consolidates the elements in the stream
 */
export declare function consolidate<T>(): PipedOperator<T, T>;
