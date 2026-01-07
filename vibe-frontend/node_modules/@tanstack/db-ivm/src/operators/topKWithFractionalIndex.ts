import { generateKeyBetween } from 'fractional-indexing'
import { DifferenceStreamWriter, UnaryOperator } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import { MultiSet } from '../multiset.js'
import { binarySearch, compareKeys, diffHalfOpen } from '../utils.js'
import type { HRange } from '../utils.js'
import type { DifferenceStreamReader } from '../graph.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'

export interface TopKWithFractionalIndexOptions {
  limit?: number
  offset?: number
  setSizeCallback?: (getSize: () => number) => void
  setWindowFn?: (
    windowFn: (options: { offset?: number; limit?: number }) => void,
  ) => void
}

export type TopKChanges<V> = {
  /** Indicates which element moves into the topK (if any) */
  moveIn: IndexedValue<V> | null
  /** Indicates which element moves out of the topK (if any) */
  moveOut: IndexedValue<V> | null
}

export type TopKMoveChanges<V> = {
  /** Flag that marks whether there were any changes to the topK */
  changes: boolean
  /** Indicates which elements move into the topK (if any) */
  moveIns: Array<IndexedValue<V>>
  /** Indicates which elements move out of the topK (if any) */
  moveOuts: Array<IndexedValue<V>>
}

/**
 * A topK data structure that supports insertions and deletions
 * and returns changes to the topK.
 */
export interface TopK<V> {
  size: number
  insert: (value: V) => TopKChanges<V>
  delete: (value: V) => TopKChanges<V>
}

/**
 * Implementation of a topK data structure.
 * Uses a sorted array internally to store the values and keeps a topK window over that array.
 * Inserts and deletes are O(n) operations because worst case an element is inserted/deleted
 * at the start of the array which causes all the elements to shift to the right/left.
 */
class TopKArray<V> implements TopK<V> {
  #sortedValues: Array<IndexedValue<V>> = []
  #comparator: (a: V, b: V) => number
  #topKStart: number
  #topKEnd: number

  constructor(
    offset: number,
    limit: number,
    comparator: (a: V, b: V) => number,
  ) {
    this.#topKStart = offset
    this.#topKEnd = offset + limit
    this.#comparator = comparator
  }

  get size(): number {
    const offset = this.#topKStart
    const limit = this.#topKEnd - this.#topKStart
    const available = this.#sortedValues.length - offset
    return Math.max(0, Math.min(limit, available))
  }

  /**
   * Moves the topK window
   */
  move({
    offset,
    limit,
  }: {
    offset?: number
    limit?: number
  }): TopKMoveChanges<V> {
    const oldOffset = this.#topKStart
    const oldLimit = this.#topKEnd - this.#topKStart

    // `this.#topKEnd` can be `Infinity` if it has no limit
    // but `diffHalfOpen` expects a finite range
    // so we restrict it to the size of the topK if topKEnd is infinite
    const oldRange: HRange = [
      this.#topKStart,
      this.#topKEnd === Infinity ? this.#topKStart + this.size : this.#topKEnd,
    ]

    this.#topKStart = offset ?? oldOffset
    this.#topKEnd = this.#topKStart + (limit ?? oldLimit) // can be `Infinity` if limit is `Infinity`

    // Also handle `Infinity` in the newRange
    const newRange: HRange = [
      this.#topKStart,
      this.#topKEnd === Infinity
        ? Math.max(this.#topKStart + this.size, oldRange[1]) // since the new limit is Infinity we need to take everything (so we need to take the biggest (finite) topKEnd)
        : this.#topKEnd,
    ]
    const { onlyInA, onlyInB } = diffHalfOpen(oldRange, newRange)

    const moveIns: Array<IndexedValue<V>> = []
    onlyInB.forEach((index) => {
      const value = this.#sortedValues[index]
      if (value) {
        moveIns.push(value)
      }
    })

    const moveOuts: Array<IndexedValue<V>> = []
    onlyInA.forEach((index) => {
      const value = this.#sortedValues[index]
      if (value) {
        moveOuts.push(value)
      }
    })

    // It could be that there are changes (i.e. moveIns or moveOuts)
    // but that the collection is lazy so we don't have the data yet that needs to move in/out
    // so `moveIns` and `moveOuts` will be empty but `changes` will be true
    // this will tell the caller that it needs to run the graph to load more data
    return { moveIns, moveOuts, changes: onlyInA.length + onlyInB.length > 0 }
  }

  insert(value: V): TopKChanges<V> {
    const result: TopKChanges<V> = { moveIn: null, moveOut: null }

    // Lookup insert position
    const index = this.#findIndex(value)
    // Generate fractional index based on the fractional indices of the elements before and after it
    const indexBefore =
      index === 0 ? null : getIndex(this.#sortedValues[index - 1]!)
    const indexAfter =
      index === this.#sortedValues.length
        ? null
        : getIndex(this.#sortedValues[index]!)
    const fractionalIndex = generateKeyBetween(indexBefore, indexAfter)

    // Insert the value at the correct position
    const val = indexedValue(value, fractionalIndex)
    // Splice is O(n) where n = all elements in the collection (i.e. n >= k) !
    this.#sortedValues.splice(index, 0, val)

    // Check if the topK changed
    if (index < this.#topKEnd) {
      // The inserted element is either before the top K or within the top K
      // If it is before the top K then it moves the element that was right before the topK into the topK
      // If it is within the top K then the inserted element moves into the top K
      // In both cases the last element of the old top K now moves out of the top K
      const moveInIndex = Math.max(index, this.#topKStart)
      if (moveInIndex < this.#sortedValues.length) {
        // We actually have a topK
        // because in some cases there may not be enough elements in the array to reach the start of the topK
        // e.g. [1, 2, 3] with K = 2 and offset = 3 does not have a topK
        result.moveIn = this.#sortedValues[moveInIndex]!

        // We need to remove the element that falls out of the top K
        // The element that falls out of the top K has shifted one to the right
        // because of the element we inserted, so we find it at index topKEnd
        if (this.#topKEnd < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[this.#topKEnd]!
        }
      }
    }

    return result
  }

  /**
   * Deletes a value that may or may not be in the topK.
   * IMPORTANT: this assumes that the value is present in the collection
   *            if it's not the case it will remove the element
   *            that is on the position where the provided `value` would be.
   */
  delete(value: V): TopKChanges<V> {
    const result: TopKChanges<V> = { moveIn: null, moveOut: null }

    // Lookup delete position
    const index = this.#findIndex(value)
    // Remove the value at that position
    const [removedElem] = this.#sortedValues.splice(index, 1)

    // Check if the topK changed
    if (index < this.#topKEnd) {
      // The removed element is either before the top K or within the top K
      // If it is before the top K then the first element of the topK moves out of the topK
      // If it is within the top K then the removed element moves out of the topK
      result.moveOut = removedElem!
      if (index < this.#topKStart) {
        // The removed element is before the topK
        // so actually, the first element of the topK moves out of the topK
        // and not the element that we removed
        // The first element of the topK is now at index topKStart - 1
        // since we removed an element before the topK
        const moveOutIndex = this.#topKStart - 1
        if (moveOutIndex < this.#sortedValues.length) {
          result.moveOut = this.#sortedValues[moveOutIndex]!
        } else {
          // No value is moving out of the topK
          // because there are no elements in the topK
          result.moveOut = null
        }
      }

      // Since we removed an element that was before or in the topK
      // the first element after the topK moved one position to the left
      // and thus falls into the topK now
      const moveInIndex = this.#topKEnd - 1
      if (moveInIndex < this.#sortedValues.length) {
        result.moveIn = this.#sortedValues[moveInIndex]!
      }
    }

    return result
  }

  // TODO: see if there is a way to refactor the code for insert and delete in the topK above
  //       because they are very similar, one is shifting the topK window to the left and the other is shifting it to the right
  //       so i have the feeling there is a common pattern here and we can implement both cases using that pattern

  #findIndex(value: V): number {
    return binarySearch(this.#sortedValues, indexedValue(value, ``), (a, b) =>
      this.#comparator(getValue(a), getValue(b)),
    )
  }
}

/**
 * Operator for fractional indexed topK operations
 * This operator maintains fractional indices for sorted elements
 * and only updates indices when elements move position
 */
export class TopKWithFractionalIndexOperator<
  K extends string | number,
  T,
> extends UnaryOperator<[K, T], [K, IndexedValue<T>]> {
  #index: Map<K, number> = new Map() // maps keys to their multiplicity

  /**
   * topK data structure that supports insertions and deletions
   * and returns changes to the topK.
   * Elements are stored as [key, value] tuples for stable tie-breaking.
   */
  #topK: TopK<[K, T]>

  constructor(
    id: number,
    inputA: DifferenceStreamReader<[K, T]>,
    output: DifferenceStreamWriter<[K, IndexedValue<T>]>,
    comparator: (a: T, b: T) => number,
    options: TopKWithFractionalIndexOptions,
  ) {
    super(id, inputA, output)
    const limit = options.limit ?? Infinity
    const offset = options.offset ?? 0
    this.#topK = this.createTopK(
      offset,
      limit,
      createKeyedComparator(comparator),
    )
    options.setSizeCallback?.(() => this.#topK.size)
    options.setWindowFn?.(this.moveTopK.bind(this))
  }

  protected createTopK(
    offset: number,
    limit: number,
    comparator: (a: [K, T], b: [K, T]) => number,
  ): TopK<[K, T]> {
    return new TopKArray(offset, limit, comparator)
  }

  /**
   * Moves the topK window based on the provided offset and limit.
   * Any changes to the topK are sent to the output.
   */
  moveTopK({ offset, limit }: { offset?: number; limit?: number }) {
    if (!(this.#topK instanceof TopKArray)) {
      throw new Error(
        `Cannot move B+-tree implementation of TopK with fractional index`,
      )
    }

    const result: Array<[[K, IndexedValue<T>], number]> = []

    const diff = this.#topK.move({ offset, limit })

    diff.moveIns.forEach((moveIn) => this.handleMoveIn(moveIn, result))
    diff.moveOuts.forEach((moveOut) => this.handleMoveOut(moveOut, result))

    if (diff.changes) {
      // There are changes to the topK
      // it could be that moveIns and moveOuts are empty
      // because the collection is lazy, so we will run the graph again to load the data
      this.output.sendData(new MultiSet(result))
    }
  }

  run(): void {
    const result: Array<[[K, IndexedValue<T>], number]> = []
    for (const message of this.inputMessages()) {
      for (const [item, multiplicity] of message.getInner()) {
        const [key, value] = item
        this.processElement(key, value, multiplicity, result)
      }
    }

    if (result.length > 0) {
      this.output.sendData(new MultiSet(result))
    }
  }

  processElement(
    key: K,
    value: T,
    multiplicity: number,
    result: Array<[[K, IndexedValue<T>], number]>,
  ): void {
    const { oldMultiplicity, newMultiplicity } = this.addKey(key, multiplicity)

    let res: TopKChanges<[K, T]> = {
      moveIn: null,
      moveOut: null,
    }
    if (oldMultiplicity <= 0 && newMultiplicity > 0) {
      // The value was invisible but should now be visible
      // Need to insert it into the array of sorted values
      res = this.#topK.insert([key, value])
    } else if (oldMultiplicity > 0 && newMultiplicity <= 0) {
      // The value was visible but should now be invisible
      // Need to remove it from the array of sorted values
      res = this.#topK.delete([key, value])
    } else {
      // The value was invisible and it remains invisible
      // or it was visible and remains visible
      // so it doesn't affect the topK
    }

    this.handleMoveIn(res.moveIn, result)
    this.handleMoveOut(res.moveOut, result)

    return
  }

  private handleMoveIn(
    moveIn: IndexedValue<[K, T]> | null,
    result: Array<[[K, IndexedValue<T>], number]>,
  ) {
    if (moveIn) {
      const [[key, value], index] = moveIn
      result.push([[key, [value, index]], 1])
    }
  }

  private handleMoveOut(
    moveOut: IndexedValue<[K, T]> | null,
    result: Array<[[K, IndexedValue<T>], number]>,
  ) {
    if (moveOut) {
      const [[key, value], index] = moveOut
      result.push([[key, [value, index]], -1])
    }
  }

  private getMultiplicity(key: K): number {
    return this.#index.get(key) ?? 0
  }

  private addKey(
    key: K,
    multiplicity: number,
  ): { oldMultiplicity: number; newMultiplicity: number } {
    const oldMultiplicity = this.getMultiplicity(key)
    const newMultiplicity = oldMultiplicity + multiplicity
    if (newMultiplicity === 0) {
      this.#index.delete(key)
    } else {
      this.#index.set(key, newMultiplicity)
    }
    return { oldMultiplicity, newMultiplicity }
  }
}

/**
 * Limits the number of results based on a comparator, with optional offset.
 * Uses fractional indexing to minimize the number of changes when elements move positions.
 * Each element is assigned a fractional index that is lexicographically sortable.
 * When elements move, only the indices of the moved elements are updated, not all elements.
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export function topKWithFractionalIndex<KType extends string | number, T>(
  comparator: (a: T, b: T) => number,
  options?: TopKWithFractionalIndexOptions,
): PipedOperator<[KType, T], [KType, IndexedValue<T>]> {
  const opts = options || {}

  return (
    stream: IStreamBuilder<[KType, T]>,
  ): IStreamBuilder<[KType, IndexedValue<T>]> => {
    const output = new StreamBuilder<[KType, IndexedValue<T>]>(
      stream.graph,
      new DifferenceStreamWriter<[KType, IndexedValue<T>]>(),
    )
    const operator = new TopKWithFractionalIndexOperator<KType, T>(
      stream.graph.getNextOperatorId(),
      stream.connectReader(),
      output.writer,
      comparator,
      opts,
    )
    stream.graph.addOperator(operator)
    return output
  }
}

// Abstraction for fractionally indexed values
export type FractionalIndex = string
export type IndexedValue<V> = [V, FractionalIndex]

export function indexedValue<V>(
  value: V,
  index: FractionalIndex,
): IndexedValue<V> {
  return [value, index]
}

export function getValue<V>(indexedVal: IndexedValue<V>): V {
  return indexedVal[0]
}

export function getIndex<V>(indexedVal: IndexedValue<V>): FractionalIndex {
  return indexedVal[1]
}

/**
 * Creates a comparator for [key, value] tuples that first compares values,
 * then uses the row key as a stable tie-breaker.
 */
function createKeyedComparator<K extends string | number, T>(
  comparator: (a: T, b: T) => number,
): (a: [K, T], b: [K, T]) => number {
  return ([aKey, aVal], [bKey, bVal]) => {
    // First compare on the value
    const valueComparison = comparator(aVal, bVal)
    if (valueComparison !== 0) {
      return valueComparison
    }
    // If the values are equal, use the row key as tie-breaker
    // This provides stable, deterministic ordering since keys are string | number
    return compareKeys(aKey, bKey)
  }
}
