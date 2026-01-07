import { MultiSet } from './multiset.js'
import type { MultiSetArray } from './multiset.js'
import type {
  IDifferenceStreamReader,
  IDifferenceStreamWriter,
  IOperator,
} from './types.js'

/**
 * A read handle to a dataflow edge that receives data from a writer.
 */
export class DifferenceStreamReader<T> implements IDifferenceStreamReader<T> {
  #queue: Array<MultiSet<T>>

  constructor(queue: Array<MultiSet<T>>) {
    this.#queue = queue
  }

  drain(): Array<MultiSet<T>> {
    const out = [...this.#queue].reverse()
    this.#queue.length = 0
    return out
  }

  isEmpty(): boolean {
    return this.#queue.length === 0
  }
}

/**
 * A write handle to a dataflow edge that is allowed to publish data.
 */
export class DifferenceStreamWriter<T> implements IDifferenceStreamWriter<T> {
  #queues: Array<Array<MultiSet<T>>> = []

  sendData(collection: MultiSet<T> | MultiSetArray<T>): void {
    if (!(collection instanceof MultiSet)) {
      collection = new MultiSet(collection)
    }

    for (const q of this.#queues) {
      q.unshift(collection)
    }
  }

  newReader(): DifferenceStreamReader<T> {
    const q: Array<MultiSet<T>> = []
    this.#queues.push(q)
    return new DifferenceStreamReader(q)
  }
}

/**
 * A generic implementation of a dataflow operator (node) that has multiple incoming edges (read handles) and
 * one outgoing edge (write handle).
 */
export abstract class Operator<T> implements IOperator<T> {
  protected inputs: Array<DifferenceStreamReader<T>>
  protected output: DifferenceStreamWriter<T>

  constructor(
    public id: number,
    inputs: Array<DifferenceStreamReader<T>>,
    output: DifferenceStreamWriter<T>,
  ) {
    this.inputs = inputs
    this.output = output
  }

  abstract run(): void

  hasPendingWork(): boolean {
    return this.inputs.some((input) => !input.isEmpty())
  }
}

/**
 * A convenience implementation of a dataflow operator that has a handle to one
 * incoming stream of data, and one handle to an outgoing stream of data.
 */
export abstract class UnaryOperator<Tin, Tout = Tin> extends Operator<
  Tin | Tout
> {
  constructor(
    public id: number,
    inputA: DifferenceStreamReader<Tin>,
    output: DifferenceStreamWriter<Tout>,
  ) {
    super(id, [inputA], output)
  }

  inputMessages(): Array<MultiSet<Tin>> {
    return this.inputs[0]!.drain() as Array<MultiSet<Tin>>
  }
}

/**
 * A convenience implementation of a dataflow operator that has a handle to two
 * incoming streams of data, and one handle to an outgoing stream of data.
 */
export abstract class BinaryOperator<T> extends Operator<T> {
  constructor(
    public id: number,
    inputA: DifferenceStreamReader<T>,
    inputB: DifferenceStreamReader<T>,
    output: DifferenceStreamWriter<T>,
  ) {
    super(id, [inputA, inputB], output)
  }

  inputAMessages(): Array<MultiSet<T>> {
    return this.inputs[0]!.drain()
  }

  inputBMessages(): Array<MultiSet<T>> {
    return this.inputs[1]!.drain()
  }
}

/**
 * Base class for operators that process a single input stream
 */
export abstract class LinearUnaryOperator<T, U> extends UnaryOperator<T | U> {
  abstract inner(collection: MultiSet<T | U>): MultiSet<U>

  run(): void {
    for (const message of this.inputMessages()) {
      this.output.sendData(this.inner(message))
    }
  }
}
