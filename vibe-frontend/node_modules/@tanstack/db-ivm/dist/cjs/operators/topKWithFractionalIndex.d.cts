import { DifferenceStreamWriter, UnaryOperator, DifferenceStreamReader } from '../graph.js';
import { PipedOperator } from '../types.js';
export interface TopKWithFractionalIndexOptions {
    limit?: number;
    offset?: number;
    setSizeCallback?: (getSize: () => number) => void;
    setWindowFn?: (windowFn: (options: {
        offset?: number;
        limit?: number;
    }) => void) => void;
}
export type TopKChanges<V> = {
    /** Indicates which element moves into the topK (if any) */
    moveIn: IndexedValue<V> | null;
    /** Indicates which element moves out of the topK (if any) */
    moveOut: IndexedValue<V> | null;
};
export type TopKMoveChanges<V> = {
    /** Flag that marks whether there were any changes to the topK */
    changes: boolean;
    /** Indicates which elements move into the topK (if any) */
    moveIns: Array<IndexedValue<V>>;
    /** Indicates which elements move out of the topK (if any) */
    moveOuts: Array<IndexedValue<V>>;
};
/**
 * A topK data structure that supports insertions and deletions
 * and returns changes to the topK.
 */
export interface TopK<V> {
    size: number;
    insert: (value: V) => TopKChanges<V>;
    delete: (value: V) => TopKChanges<V>;
}
/**
 * Operator for fractional indexed topK operations
 * This operator maintains fractional indices for sorted elements
 * and only updates indices when elements move position
 */
export declare class TopKWithFractionalIndexOperator<K extends string | number, T> extends UnaryOperator<[K, T], [K, IndexedValue<T>]> {
    #private;
    constructor(id: number, inputA: DifferenceStreamReader<[K, T]>, output: DifferenceStreamWriter<[K, IndexedValue<T>]>, comparator: (a: T, b: T) => number, options: TopKWithFractionalIndexOptions);
    protected createTopK(offset: number, limit: number, comparator: (a: [K, T], b: [K, T]) => number): TopK<[K, T]>;
    /**
     * Moves the topK window based on the provided offset and limit.
     * Any changes to the topK are sent to the output.
     */
    moveTopK({ offset, limit }: {
        offset?: number;
        limit?: number;
    }): void;
    run(): void;
    processElement(key: K, value: T, multiplicity: number, result: Array<[[K, IndexedValue<T>], number]>): void;
    private handleMoveIn;
    private handleMoveOut;
    private getMultiplicity;
    private addKey;
}
/**
 * Limits the number of results based on a comparator, with optional offset.
 * Uses fractional indexing to minimize the number of changes when elements move positions.
 * Each element is assigned a fractional index that is lexicographically sortable.
 * When elements move, only the indices of the moved elements are updated, not all elements.
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export declare function topKWithFractionalIndex<KType extends string | number, T>(comparator: (a: T, b: T) => number, options?: TopKWithFractionalIndexOptions): PipedOperator<[KType, T], [KType, IndexedValue<T>]>;
export type FractionalIndex = string;
export type IndexedValue<V> = [V, FractionalIndex];
export declare function indexedValue<V>(value: V, index: FractionalIndex): IndexedValue<V>;
export declare function getValue<V>(indexedVal: IndexedValue<V>): V;
export declare function getIndex<V>(indexedVal: IndexedValue<V>): FractionalIndex;
