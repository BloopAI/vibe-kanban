import { BinaryOperator } from '../graph.js';
import { IStreamBuilder, PipedOperator } from '../types.js';
/**
 * Operator that concatenates two input streams
 */
export declare class ConcatOperator<T, T2> extends BinaryOperator<T | T2> {
    run(): void;
}
/**
 * Concatenates two input streams
 * @param other - The other stream to concatenate
 */
export declare function concat<T, T2>(other: IStreamBuilder<T2>): PipedOperator<T, T | T2>;
