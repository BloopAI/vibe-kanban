import { DifferenceStreamWriter, UnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'
import type { DifferenceStreamReader } from '../graph.js'

/**
 * Operator that logs debug information about the stream
 */
export class DebugOperator<T> extends UnaryOperator<T> {
  #name: string
  #indent: boolean

  constructor(
    id: number,
    inputA: DifferenceStreamReader<T>,
    output: DifferenceStreamWriter<T>,
    name: string,
    indent: boolean = false,
  ) {
    super(id, inputA, output)
    this.#name = name
    this.#indent = indent
  }

  run(): void {
    for (const message of this.inputMessages()) {
      console.log(`debug ${this.#name} data: ${message.toString(this.#indent)}`)
      this.output.sendData(message)
    }
  }
}

/**
 * Logs debug information about the stream using console.log
 * @param name - The name to prefix debug messages with
 * @param indent - Whether to indent the debug output
 */
export function debug<T>(
  name: string,
  indent: boolean = false,
): PipedOperator<T, T> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<T> => {
    const output = new StreamBuilder<T>(
      stream.graph,
      new DifferenceStreamWriter<T>(),
    )
    const operator = new DebugOperator<T>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      name,
      indent,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
