import { topK, topKWithIndex } from './topK.js'
import { topKWithFractionalIndex } from './topKWithFractionalIndex.js'
import { map } from './map.js'
import { innerJoin } from './join.js'
import { consolidate } from './consolidate.js'
import type { IStreamBuilder, KeyValue } from '../types.js'

export interface OrderByOptions<Ve> {
  comparator?: (a: Ve, b: Ve) => number
  limit?: number
  offset?: number
}

type OrderByWithFractionalIndexOptions<Ve> = OrderByOptions<Ve> & {
  setSizeCallback?: (getSize: () => number) => void
  setWindowFn?: (
    windowFn: (options: { offset?: number; limit?: number }) => void,
  ) => void
}

/**
 * Orders the elements and limits the number of results, with optional offset
 * This requires a keyed stream, and uses the `topK` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export function orderBy<T extends KeyValue<unknown, unknown>, Ve = unknown>(
  valueExtractor: (
    value: T extends KeyValue<unknown, infer V> ? V : never,
  ) => Ve,
  options?: OrderByOptions<Ve>,
) {
  const limit = options?.limit ?? Infinity
  const offset = options?.offset ?? 0
  const comparator =
    options?.comparator ??
    ((a, b) => {
      // Default to JS like ordering
      if (a === b) return 0
      if (a < b) return -1
      return 1
    })

  return (stream: IStreamBuilder<T>): IStreamBuilder<T> => {
    type KeyType = T extends KeyValue<infer K, unknown> ? K : never

    return stream.pipe(
      map(
        ([key, value]) =>
          [
            null,
            [
              key,
              valueExtractor(
                value as T extends KeyValue<unknown, infer V> ? V : never,
              ),
            ],
          ] as KeyValue<null, [KeyType, Ve]>,
      ),
      topK((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map(([_, [key]]) => [key, null] as KeyValue<KeyType, null>),
      innerJoin(stream),
      map(([key, value]) => {
        return [key, value[1]] as T
      }),
      consolidate(),
    )
  }
}

/**
 * Orders the elements and limits the number of results, with optional offset and
 * annotates the value with the index.
 * This requires a keyed stream, and uses the `topKWithIndex` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export function orderByWithIndex<
  T extends KeyValue<unknown, unknown>,
  Ve = unknown,
>(
  valueExtractor: (
    value: T extends KeyValue<unknown, infer V> ? V : never,
  ) => Ve,
  options?: OrderByOptions<Ve>,
) {
  const limit = options?.limit ?? Infinity
  const offset = options?.offset ?? 0
  const comparator =
    options?.comparator ??
    ((a, b) => {
      // Default to JS like ordering
      if (a === b) return 0
      if (a < b) return -1
      return 1
    })

  return (
    stream: IStreamBuilder<T>,
  ): IStreamBuilder<
    KeyValue<
      T extends KeyValue<infer K, unknown> ? K : never,
      [T extends KeyValue<unknown, infer V> ? V : never, number]
    >
  > => {
    type KeyType = T extends KeyValue<infer K, unknown> ? K : never
    type ValueType = T extends KeyValue<unknown, infer V> ? V : never

    return stream.pipe(
      map(
        ([key, value]) =>
          [
            null,
            [
              key,
              valueExtractor(
                value as T extends KeyValue<unknown, infer V> ? V : never,
              ),
            ],
          ] as KeyValue<null, [KeyType, Ve]>,
      ),
      topKWithIndex((a, b) => comparator(a[1], b[1]), { limit, offset }),
      map(([_, [[key], index]]) => [key, index] as KeyValue<KeyType, number>),
      innerJoin(stream),
      map(([key, [index, value]]) => {
        return [key, [value, index]] as KeyValue<KeyType, [ValueType, number]>
      }),
      consolidate(),
    )
  }
}

export function orderByWithFractionalIndexBase<
  T extends KeyValue<unknown, unknown>,
  Ve = unknown,
>(
  topKFunction: typeof topKWithFractionalIndex,
  valueExtractor: (
    value: T extends KeyValue<unknown, infer V> ? V : never,
  ) => Ve,
  options?: OrderByWithFractionalIndexOptions<Ve>,
) {
  type KeyType = T extends KeyValue<infer K, unknown> ? K : never
  type ValueType = T extends KeyValue<unknown, infer V> ? V : never

  const limit = options?.limit ?? Infinity
  const offset = options?.offset ?? 0
  const setSizeCallback = options?.setSizeCallback
  const setWindowFn = options?.setWindowFn
  const comparator =
    options?.comparator ??
    ((a, b) => {
      // Default to JS like ordering
      if (a === b) return 0
      if (a < b) return -1
      return 1
    })

  return (
    stream: IStreamBuilder<T>,
  ): IStreamBuilder<[KeyType, [ValueType, string]]> => {
    return stream.pipe(
      topKFunction(
        (a: ValueType, b: ValueType) =>
          comparator(valueExtractor(a), valueExtractor(b)),
        {
          limit,
          offset,
          setSizeCallback,
          setWindowFn,
        },
      ),
      consolidate(),
    )
  }
}

/**
 * Orders the elements and limits the number of results, with optional offset and
 * annotates the value with a fractional index.
 * This requires a keyed stream, and uses the `topKWithFractionalIndex` operator to order all the elements.
 *
 * @param valueExtractor - A function that extracts the value to order by from the element
 * @param options - An optional object containing comparator, limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export function orderByWithFractionalIndex<
  T extends KeyValue<unknown, unknown>,
  Ve = unknown,
>(
  valueExtractor: (
    value: T extends KeyValue<unknown, infer V> ? V : never,
  ) => Ve,
  options?: OrderByWithFractionalIndexOptions<Ve>,
) {
  return orderByWithFractionalIndexBase(
    topKWithFractionalIndex,
    valueExtractor,
    options,
  )
}
