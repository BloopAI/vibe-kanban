import { orderByWithFractionalIndexBase } from './orderBy.js'
import { topKWithFractionalIndexBTree } from './topKWithFractionalIndexBTree.js'
import type { KeyValue } from '../types.js'
import type { OrderByOptions } from './orderBy.js'

export function orderByWithFractionalIndexBTree<
  T extends KeyValue<unknown, unknown>,
  Ve = unknown,
>(
  valueExtractor: (
    value: T extends KeyValue<unknown, infer V> ? V : never,
  ) => Ve,
  options?: OrderByOptions<Ve>,
) {
  return orderByWithFractionalIndexBase(
    topKWithFractionalIndexBTree,
    valueExtractor,
    options,
  )
}
