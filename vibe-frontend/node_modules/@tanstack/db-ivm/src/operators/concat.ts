import { BinaryOperator, DifferenceStreamWriter } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'

/**
 * Operator that concatenates two input streams
 */
export class ConcatOperator<T, T2> extends BinaryOperator<T | T2> {
  run(): void {
    for (const message of this.inputAMessages()) {
      this.output.sendData(message)
    }

    for (const message of this.inputBMessages()) {
      this.output.sendData(message)
    }
  }
}

/**
 * Concatenates two input streams
 * @param other - The other stream to concatenate
 */
export function concat<T, T2>(
  other: IStreamBuilder<T2>,
): PipedOperator<T, T | T2> {
  return (stream: IStreamBuilder<T | T2>): IStreamBuilder<T | T2> => {
    if (stream.graph !== other.graph) {
      throw new Error(`Cannot concat streams from different graphs`)
    }
    const output = new StreamBuilder<T | T2>(
      stream.graph,
      new DifferenceStreamWriter<T | T2>(),
    )
    const operator = new ConcatOperator<T, T2>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      other.connectReader(),
      output.writer,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
