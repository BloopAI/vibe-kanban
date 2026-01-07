import { BinaryOperator, DifferenceStreamWriter, DifferenceStreamReader } from '../graph.js';
import { IStreamBuilder, KeyValue, PipedOperator } from '../types.js';
/**
 * Type of join to perform
 */
export type JoinType = `inner` | `left` | `right` | `full` | `anti`;
/**
 * Operator that joins two input streams using direct join algorithms
 */
export declare class JoinOperator<K, V1, V2> extends BinaryOperator<[
    K,
    V1
] | [K, V2] | [K, [V1, V2]] | [K, [V1 | null, V2 | null]]> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<[K, V1]>, inputB: DifferenceStreamReader<[K, V2]>, output: DifferenceStreamWriter<any>, mode?: JoinType);
    run(): void;
    private emitInnerResults;
    private emitLeftOuterResults;
    private emitRightOuterResults;
}
/**
 * Joins two input streams
 * @param other - The other stream to join with
 * @param type - The type of join to perform
 */
export declare function join<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>, type?: JoinType): PipedOperator<T, KeyValue<K, [V1 | null, V2 | null]>>;
/**
 * Joins two input streams (inner join)
 * @param other - The other stream to join with
 */
export declare function innerJoin<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>): PipedOperator<T, KeyValue<K, [V1, V2]>>;
/**
 * Joins two input streams (anti join)
 * @param other - The other stream to join with
 */
export declare function antiJoin<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>): PipedOperator<T, KeyValue<K, [V1, null]>>;
/**
 * Joins two input streams (left join)
 * @param other - The other stream to join with
 */
export declare function leftJoin<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>): PipedOperator<T, KeyValue<K, [V1, V2 | null]>>;
/**
 * Joins two input streams (right join)
 * @param other - The other stream to join with
 */
export declare function rightJoin<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>): PipedOperator<T, KeyValue<K, [V1 | null, V2]>>;
/**
 * Joins two input streams (full join)
 * @param other - The other stream to join with
 */
export declare function fullJoin<K, V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never, V2, T>(other: IStreamBuilder<KeyValue<K, V2>>): PipedOperator<T, KeyValue<K, [V1 | null, V2 | null]>>;
