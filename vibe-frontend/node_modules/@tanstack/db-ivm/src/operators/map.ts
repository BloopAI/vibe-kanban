import { DifferenceStreamWriter, LinearUnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { MultiSet } from '../multiset.js'

/**
 * Operator that applies a function to each element in the input stream
 */
export class MapOperator<T, U> extends LinearUnaryOperator<T, U> {
  #f: (data: T) => U

  constructor(
    id: number,
    inputA: DifferenceStreamReader<T>,
    output: DifferenceStreamWriter<U>,
    f: (data: T) => U,
  ) {
    super(id, inputA, output)
    this.#f = f
  }

  inner(collection: MultiSet<T>): MultiSet<U> {
    return collection.map(this.#f)
  }
}

/**
 * Applies a function to each element in the input stream
 * @param f - The function to apply to each element
 */
export function map<T, O>(f: (data: T) => O): PipedOperator<T, O> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<O> => {
    const output = new StreamBuilder<O>(
      stream.graph,
      new DifferenceStreamWriter<O>(),
    )
    const operator = new MapOperator<T, O>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      f,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
