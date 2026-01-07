import { compileSingleRowExpression } from '../query/compiler/evaluators.js'
import { comparisonFunctions } from '../query/builder/functions.js'
import { DEFAULT_COMPARE_OPTIONS, deepEquals } from '../utils.js'
import type { RangeQueryOptions } from './btree-index.js'
import type { CompareOptions } from '../query/builder/types.js'
import type { BasicExpression, OrderByDirection } from '../query/ir.js'

/**
 * Operations that indexes can support, imported from available comparison functions
 */
export const IndexOperation = comparisonFunctions

/**
 * Type for index operation values
 */
export type IndexOperation = (typeof comparisonFunctions)[number]

/**
 * Statistics about index usage and performance
 */
export interface IndexStats {
  readonly entryCount: number
  readonly lookupCount: number
  readonly averageLookupTime: number
  readonly lastUpdated: Date
}

export interface IndexInterface<
  TKey extends string | number = string | number,
> {
  add: (key: TKey, item: any) => void
  remove: (key: TKey, item: any) => void
  update: (key: TKey, oldItem: any, newItem: any) => void

  build: (entries: Iterable<[TKey, any]>) => void
  clear: () => void

  lookup: (operation: IndexOperation, value: any) => Set<TKey>

  equalityLookup: (value: any) => Set<TKey>
  inArrayLookup: (values: Array<any>) => Set<TKey>

  rangeQuery: (options: RangeQueryOptions) => Set<TKey>
  rangeQueryReversed: (options: RangeQueryOptions) => Set<TKey>

  take: (
    n: number,
    from?: TKey,
    filterFn?: (key: TKey) => boolean,
  ) => Array<TKey>
  takeReversed: (
    n: number,
    from?: TKey,
    filterFn?: (key: TKey) => boolean,
  ) => Array<TKey>

  get keyCount(): number
  get orderedEntriesArray(): Array<[any, Set<TKey>]>
  get orderedEntriesArrayReversed(): Array<[any, Set<TKey>]>

  get indexedKeysSet(): Set<TKey>
  get valueMapData(): Map<any, Set<TKey>>

  supports: (operation: IndexOperation) => boolean

  matchesField: (fieldPath: Array<string>) => boolean
  matchesCompareOptions: (compareOptions: CompareOptions) => boolean
  matchesDirection: (direction: OrderByDirection) => boolean

  getStats: () => IndexStats
}

/**
 * Base abstract class that all index types extend
 */
export abstract class BaseIndex<
  TKey extends string | number = string | number,
> implements IndexInterface<TKey> {
  public readonly id: number
  public readonly name?: string
  public readonly expression: BasicExpression
  public abstract readonly supportedOperations: Set<IndexOperation>

  protected lookupCount = 0
  protected totalLookupTime = 0
  protected lastUpdated = new Date()
  protected compareOptions: CompareOptions

  constructor(
    id: number,
    expression: BasicExpression,
    name?: string,
    options?: any,
  ) {
    this.id = id
    this.expression = expression
    this.compareOptions = DEFAULT_COMPARE_OPTIONS
    this.name = name
    this.initialize(options)
  }

  // Abstract methods that each index type must implement
  abstract add(key: TKey, item: any): void
  abstract remove(key: TKey, item: any): void
  abstract update(key: TKey, oldItem: any, newItem: any): void
  abstract build(entries: Iterable<[TKey, any]>): void
  abstract clear(): void
  abstract lookup(operation: IndexOperation, value: any): Set<TKey>
  abstract take(
    n: number,
    from?: TKey,
    filterFn?: (key: TKey) => boolean,
  ): Array<TKey>
  abstract takeReversed(
    n: number,
    from?: TKey,
    filterFn?: (key: TKey) => boolean,
  ): Array<TKey>
  abstract get keyCount(): number
  abstract equalityLookup(value: any): Set<TKey>
  abstract inArrayLookup(values: Array<any>): Set<TKey>
  abstract rangeQuery(options: RangeQueryOptions): Set<TKey>
  abstract rangeQueryReversed(options: RangeQueryOptions): Set<TKey>
  abstract get orderedEntriesArray(): Array<[any, Set<TKey>]>
  abstract get orderedEntriesArrayReversed(): Array<[any, Set<TKey>]>
  abstract get indexedKeysSet(): Set<TKey>
  abstract get valueMapData(): Map<any, Set<TKey>>

  // Common methods
  supports(operation: IndexOperation): boolean {
    return this.supportedOperations.has(operation)
  }

  matchesField(fieldPath: Array<string>): boolean {
    return (
      this.expression.type === `ref` &&
      this.expression.path.length === fieldPath.length &&
      this.expression.path.every((part, i) => part === fieldPath[i])
    )
  }

  /**
   * Checks if the compare options match the index's compare options.
   * The direction is ignored because the index can be reversed if the direction is different.
   */
  matchesCompareOptions(compareOptions: CompareOptions): boolean {
    const thisCompareOptionsWithoutDirection = {
      ...this.compareOptions,
      direction: undefined,
    }
    const compareOptionsWithoutDirection = {
      ...compareOptions,
      direction: undefined,
    }

    return deepEquals(
      thisCompareOptionsWithoutDirection,
      compareOptionsWithoutDirection,
    )
  }

  /**
   * Checks if the index matches the provided direction.
   */
  matchesDirection(direction: OrderByDirection): boolean {
    return this.compareOptions.direction === direction
  }

  getStats(): IndexStats {
    return {
      entryCount: this.keyCount,
      lookupCount: this.lookupCount,
      averageLookupTime:
        this.lookupCount > 0 ? this.totalLookupTime / this.lookupCount : 0,
      lastUpdated: this.lastUpdated,
    }
  }

  // Protected methods for subclasses
  protected abstract initialize(options?: any): void

  protected evaluateIndexExpression(item: any): any {
    const evaluator = compileSingleRowExpression(this.expression)
    return evaluator(item as Record<string, unknown>)
  }

  protected trackLookup(startTime: number): void {
    const duration = performance.now() - startTime
    this.lookupCount++
    this.totalLookupTime += duration
  }

  protected updateTimestamp(): void {
    this.lastUpdated = new Date()
  }
}

/**
 * Type for index constructor
 */
export type IndexConstructor<TKey extends string | number = string | number> =
  new (
    id: number,
    expression: BasicExpression,
    name?: string,
    options?: any,
  ) => BaseIndex<TKey>

/**
 * Index resolver can be either a class constructor or async loader
 */
export type IndexResolver<TKey extends string | number = string | number> =
  | IndexConstructor<TKey>
  | (() => Promise<IndexConstructor<TKey>>)
