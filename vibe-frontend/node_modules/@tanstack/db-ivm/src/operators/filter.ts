import { DifferenceStreamWriter, LinearUnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { MultiSet } from '../multiset.js'

/**
 * Operator that filters elements from the input stream
 */
export class FilterOperator<T> extends LinearUnaryOperator<T, T> {
  #f: (data: T) => boolean

  constructor(
    id: number,
    inputA: DifferenceStreamReader<T>,
    output: DifferenceStreamWriter<T>,
    f: (data: T) => boolean,
  ) {
    super(id, inputA, output)
    this.#f = f
  }

  inner(collection: MultiSet<T>): MultiSet<T> {
    return collection.filter(this.#f)
  }
}

/**
 * Filters elements from the input stream
 * @param f - The predicate to filter elements
 */
export function filter<T>(f: (data: T) => boolean): PipedOperator<T, T> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<T> => {
    const output = new StreamBuilder<T>(
      stream.graph,
      new DifferenceStreamWriter<T>(),
    )
    const operator = new FilterOperator<T>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      f,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
