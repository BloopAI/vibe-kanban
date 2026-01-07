import type { CompareOptions } from '../query/builder/types'
import type { OrderByDirection } from '../query/ir'
import type { IndexInterface, IndexOperation, IndexStats } from './base-index'
import type { RangeQueryOptions } from './btree-index'

export class ReverseIndex<
  TKey extends string | number,
> implements IndexInterface<TKey> {
  private originalIndex: IndexInterface<TKey>

  constructor(index: IndexInterface<TKey>) {
    this.originalIndex = index
  }

  // Define the reversed operations

  lookup(operation: IndexOperation, value: any): Set<TKey> {
    const reverseOperation =
      operation === `gt`
        ? `lt`
        : operation === `gte`
          ? `lte`
          : operation === `lt`
            ? `gt`
            : operation === `lte`
              ? `gte`
              : operation
    return this.originalIndex.lookup(reverseOperation, value)
  }

  rangeQuery(options: RangeQueryOptions = {}): Set<TKey> {
    return this.originalIndex.rangeQueryReversed(options)
  }

  rangeQueryReversed(options: RangeQueryOptions = {}): Set<TKey> {
    return this.originalIndex.rangeQuery(options)
  }

  take(n: number, from?: any, filterFn?: (key: TKey) => boolean): Array<TKey> {
    return this.originalIndex.takeReversed(n, from, filterFn)
  }

  takeReversed(
    n: number,
    from?: any,
    filterFn?: (key: TKey) => boolean,
  ): Array<TKey> {
    return this.originalIndex.take(n, from, filterFn)
  }

  get orderedEntriesArray(): Array<[any, Set<TKey>]> {
    return this.originalIndex.orderedEntriesArrayReversed
  }

  get orderedEntriesArrayReversed(): Array<[any, Set<TKey>]> {
    return this.originalIndex.orderedEntriesArray
  }

  // All operations below delegate to the original index

  supports(operation: IndexOperation): boolean {
    return this.originalIndex.supports(operation)
  }

  matchesField(fieldPath: Array<string>): boolean {
    return this.originalIndex.matchesField(fieldPath)
  }

  matchesCompareOptions(compareOptions: CompareOptions): boolean {
    return this.originalIndex.matchesCompareOptions(compareOptions)
  }

  matchesDirection(direction: OrderByDirection): boolean {
    return this.originalIndex.matchesDirection(direction)
  }

  getStats(): IndexStats {
    return this.originalIndex.getStats()
  }

  add(key: TKey, item: any): void {
    this.originalIndex.add(key, item)
  }

  remove(key: TKey, item: any): void {
    this.originalIndex.remove(key, item)
  }

  update(key: TKey, oldItem: any, newItem: any): void {
    this.originalIndex.update(key, oldItem, newItem)
  }

  build(entries: Iterable<[TKey, any]>): void {
    this.originalIndex.build(entries)
  }

  clear(): void {
    this.originalIndex.clear()
  }

  get keyCount(): number {
    return this.originalIndex.keyCount
  }

  equalityLookup(value: any): Set<TKey> {
    return this.originalIndex.equalityLookup(value)
  }

  inArrayLookup(values: Array<any>): Set<TKey> {
    return this.originalIndex.inArrayLookup(values)
  }

  get indexedKeysSet(): Set<TKey> {
    return this.originalIndex.indexedKeysSet
  }

  get valueMapData(): Map<any, Set<TKey>> {
    return this.originalIndex.valueMapData
  }
}
