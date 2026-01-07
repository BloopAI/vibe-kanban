import { LinearUnaryOperator } from '../graph.js';
import { PipedOperator } from '../types.js';
import { MultiSet } from '../multiset.js';
/**
 * Operator that negates the multiplicities in the input stream
 */
export declare class NegateOperator<T> extends LinearUnaryOperator<T, T> {
    inner(collection: MultiSet<T>): MultiSet<T>;
}
/**
 * Negates the multiplicities in the input stream
 */
export declare function negate<T>(): PipedOperator<T, T>;
