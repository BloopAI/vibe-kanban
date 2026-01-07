import { map } from './map.js'
import { innerJoin } from './join.js'
import { consolidate } from './consolidate.js'
import type { IStreamBuilder, KeyValue, PipedOperator } from '../types.js'

/**
 * Filters the elements of a keyed stream, by keys of another stream.
 * This allows you to build pipelies where you have multiple outputs that are related,
 * such as a streams of issues and comments for a project.
 *
 * @param other - The other stream to filter by, which must have the same key type as the input stream
 */
export function filterBy<
  K,
  V1 extends T extends KeyValue<infer _KT, infer VT> ? VT : never,
  T,
>(
  other: IStreamBuilder<KeyValue<K, unknown>>,
): PipedOperator<T, KeyValue<K, V1>> {
  return (stream: IStreamBuilder<T>): IStreamBuilder<KeyValue<K, V1>> => {
    const otherKeys = other.pipe(
      map(([key, _]) => [key, null] as KeyValue<K, null>),
    )
    return stream.pipe(
      innerJoin(otherKeys),
      map(([key, [value, _]]) => [key, value] as KeyValue<K, V1>),
      consolidate(),
    )
  }
}
