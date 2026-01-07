import { MultiSet, MultiSetArray } from './multiset.js';
import { IDifferenceStreamReader, IDifferenceStreamWriter, IOperator } from './types.js';
/**
 * A read handle to a dataflow edge that receives data from a writer.
 */
export declare class DifferenceStreamReader<T> implements IDifferenceStreamReader<T> {
    #private;
    constructor(queue: Array<MultiSet<T>>);
    drain(): Array<MultiSet<T>>;
    isEmpty(): boolean;
}
/**
 * A write handle to a dataflow edge that is allowed to publish data.
 */
export declare class DifferenceStreamWriter<T> implements IDifferenceStreamWriter<T> {
    #private;
    sendData(collection: MultiSet<T> | MultiSetArray<T>): void;
    newReader(): DifferenceStreamReader<T>;
}
/**
 * A generic implementation of a dataflow operator (node) that has multiple incoming edges (read handles) and
 * one outgoing edge (write handle).
 */
export declare abstract class Operator<T> implements IOperator<T> {
    id: number;
    protected inputs: Array<DifferenceStreamReader<T>>;
    protected output: DifferenceStreamWriter<T>;
    constructor(id: number, inputs: Array<DifferenceStreamReader<T>>, output: DifferenceStreamWriter<T>);
    abstract run(): void;
    hasPendingWork(): boolean;
}
/**
 * A convenience implementation of a dataflow operator that has a handle to one
 * incoming stream of data, and one handle to an outgoing stream of data.
 */
export declare abstract class UnaryOperator<Tin, Tout = Tin> extends Operator<Tin | Tout> {
    id: number;
    constructor(id: number, inputA: DifferenceStreamReader<Tin>, output: DifferenceStreamWriter<Tout>);
    inputMessages(): Array<MultiSet<Tin>>;
}
/**
 * A convenience implementation of a dataflow operator that has a handle to two
 * incoming streams of data, and one handle to an outgoing stream of data.
 */
export declare abstract class BinaryOperator<T> extends Operator<T> {
    id: number;
    constructor(id: number, inputA: DifferenceStreamReader<T>, inputB: DifferenceStreamReader<T>, output: DifferenceStreamWriter<T>);
    inputAMessages(): Array<MultiSet<T>>;
    inputBMessages(): Array<MultiSet<T>>;
}
/**
 * Base class for operators that process a single input stream
 */
export declare abstract class LinearUnaryOperator<T, U> extends UnaryOperator<T | U> {
    abstract inner(collection: MultiSet<T | U>): MultiSet<U>;
    run(): void;
}
