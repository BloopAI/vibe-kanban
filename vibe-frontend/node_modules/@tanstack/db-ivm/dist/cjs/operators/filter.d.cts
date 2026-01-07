import { DifferenceStreamWriter, LinearUnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
import { MultiSet } from '../multiset.js';
/**
 * Operator that filters elements from the input stream
 */
export declare class FilterOperator<T> extends LinearUnaryOperator<T, T> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<T>, output: DifferenceStreamWriter<T>, f: (data: T) => boolean);
    inner(collection: MultiSet<T>): MultiSet<T>;
}
/**
 * Filters elements from the input stream
 * @param f - The predicate to filter elements
 */
export declare function filter<T>(f: (data: T) => boolean): PipedOperator<T, T>;
