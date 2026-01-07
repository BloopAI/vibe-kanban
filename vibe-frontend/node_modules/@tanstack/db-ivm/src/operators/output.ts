import { DifferenceStreamWriter, UnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { MultiSet } from '../multiset.js'

/**
 * Operator that outputs the messages in the stream
 */
export class OutputOperator<T> extends UnaryOperator<T> {
  #fn: (data: MultiSet<T>) => void

  constructor(
    id: number,
    inputA: DifferenceStreamReader<T>,
    outputWriter: DifferenceStreamWriter<T>,
    fn: (data: MultiSet<T>) => void,
  ) {
    super(id, inputA, outputWriter)
    this.#fn = fn
  }

  run(): void {
    for (const message of this.inputMessages()) {
      this.#fn(message)
      this.output.sendData(message)
    }
  }
}

/**
 * Outputs the messages in the stream
 * @param fn - The function to call with each message
 */
export function output<T>(
  fn: (data: MultiSet<T>) => void,
): PipedOperator<T, T> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<T> => {
    const outputStream = new StreamBuilder<T>(
      stream.graph,
      new DifferenceStreamWriter<T>(),
    )
    const operator = new OutputOperator<T>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      outputStream.writer,
      fn,
    )
    stream.graph.addOperator(operator)
    return outputStream
  }
}
