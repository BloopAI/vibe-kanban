import { DifferenceStreamWriter, UnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import { MultiSet } from '../multiset.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'

/**
 * Operator that consolidates collections
 */
export class ConsolidateOperator<T> extends UnaryOperator<T> {
  run(): void {
    const messages = this.inputMessages()
    if (messages.length === 0) {
      return
    }

    // Combine all messages into a single MultiSet
    const combined = new MultiSet<T>()
    for (const message of messages) {
      combined.extend(message)
    }

    // Consolidate the combined MultiSet
    const consolidated = combined.consolidate()

    // Only send if there are results
    if (consolidated.getInner().length > 0) {
      this.output.sendData(consolidated)
    }
  }
}

/**
 * Consolidates the elements in the stream
 */
export function consolidate<T>(): PipedOperator<T, T> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<T> => {
    const output = new StreamBuilder<T>(
      stream.graph,
      new DifferenceStreamWriter<T>(),
    )
    const operator = new ConsolidateOperator<T>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
