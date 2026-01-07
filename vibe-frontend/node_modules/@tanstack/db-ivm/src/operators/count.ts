import { DifferenceStreamWriter } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import { ReduceOperator } from './reduce.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { IStreamBuilder, KeyValue } from '../types.js'

/**
 * Operator that counts elements by key (version-free)
 */
export class CountOperator<K, V> extends ReduceOperator<K, V, number> {
  constructor(
    id: number,
    inputA: DifferenceStreamReader<[K, V]>,
    output: DifferenceStreamWriter<[K, number]>,
  ) {
    const countInner = (vals: Array<[V, number]>): Array<[number, number]> => {
      let totalCount = 0
      for (const [_, diff] of vals) {
        totalCount += diff
      }
      return [[totalCount, 1]]
    }

    super(id, inputA, output, countInner)
  }
}

/**
 * Counts the number of elements by key (version-free)
 */
export function count<
  KType extends T extends KeyValue<infer K, infer _V> ? K : never,
  VType extends T extends KeyValue<KType, infer V> ? V : never,
  T,
>() {
  return (
    stream: IStreamBuilder<T>,
  ): IStreamBuilder<KeyValue<KType, number>> => {
    const output = new StreamBuilder<KeyValue<KType, number>>(
      stream.graph,
      new DifferenceStreamWriter<KeyValue<KType, number>>(),
    )
    const operator = new CountOperator<KType, VType>(
      stream.graph.getNextOperatorId(),
      stream.connectReader() as DifferenceStreamReader<KeyValue<KType, VType>>,
      output.writer,
    )
    stream.graph.addOperator(operator)
    return output
  }
}
