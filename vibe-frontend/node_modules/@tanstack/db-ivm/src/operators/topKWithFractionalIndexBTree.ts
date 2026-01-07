import { generateKeyBetween } from 'fractional-indexing'
import { DifferenceStreamWriter } from '../graph.js'
import { StreamBuilder } from '../d2.js'
import {
  TopKWithFractionalIndexOperator,
  getIndex,
  getValue,
  indexedValue,
} from './topKWithFractionalIndex.js'
import type { IStreamBuilder, PipedOperator } from '../types.js'
import type {
  IndexedValue,
  TopK,
  TopKChanges,
  TopKWithFractionalIndexOptions,
} from './topKWithFractionalIndex.js'

interface BTree<Key, Value> {
  nextLowerPair: (key: Key) => [Key, Value] | undefined
  nextHigherPair: (key: Key) => [Key, Value] | undefined
  set: (key: Key, value: Value, overwrite?: boolean) => boolean
  maxKey: () => Key | undefined
  get: (key: Key, defaultValue?: Value) => Value | undefined
  delete: (key: Key) => boolean
  size: number
}

interface BTreeClass {
  new <Key, Value>(
    entries?: Array<[Key, Value]>,
    compare?: (a: Key, b: Key) => number,
    maxNodeSize?: number,
  ): BTree<Key, Value>
}

let BTree: BTreeClass | undefined

export async function loadBTree() {
  if (BTree === undefined) {
    const { default: _BTreeClass } = await import(`sorted-btree`)
    BTree = _BTreeClass
  }
}

/**
 * Implementation of a topK data structure that uses a B+ tree.
 * The tree allows for logarithmic time insertions and deletions.
 */
class TopKTree<V> implements TopK<V> {
  #comparator: (a: V, b: V) => number
  // topK is a window at position [topKStart, topKEnd[
  // i.e. `topKStart` is inclusive and `topKEnd` is exclusive
  #topKStart: number
  #topKEnd: number

  #tree: BTree<V, IndexedValue<V>>
  #topKFirstElem: IndexedValue<V> | null = null // inclusive
  #topKLastElem: IndexedValue<V> | null = null // inclusive

  constructor(
    offset: number,
    limit: number,
    comparator: (a: V, b: V) => number,
  ) {
    if (BTree === undefined) {
      throw new Error(
        `B+ tree not loaded. You need to call loadBTree() before using TopKTree.`,
      )
    }

    this.#topKStart = offset
    this.#topKEnd = offset + limit
    this.#comparator = comparator
    this.#tree = new BTree(undefined, comparator)
  }

  get size(): number {
    const offset = this.#topKStart
    const limit = this.#topKEnd - this.#topKStart
    const available = this.#tree.size - offset
    return Math.max(0, Math.min(limit, available))
  }

  /**
   * Insert a *new* value.
   * Ignores the value if it is already present.
   */
  insert(value: V): TopKChanges<V> {
    const result: TopKChanges<V> = { moveIn: null, moveOut: null }

    // Get the elements before and after the value
    const [, indexedValueBefore] = this.#tree.nextLowerPair(value) ?? [
      null,
      null,
    ]
    const [, indexedValueAfter] = this.#tree.nextHigherPair(value) ?? [
      null,
      null,
    ]

    const indexBefore = indexedValueBefore ? getIndex(indexedValueBefore) : null
    const indexAfter = indexedValueAfter ? getIndex(indexedValueAfter) : null

    // Generate a fractional index for the value
    // based on the fractional indices of the elements before and after it
    const fractionalIndex = generateKeyBetween(indexBefore, indexAfter)
    const insertedElem = indexedValue(value, fractionalIndex)

    // Insert the value into the tree
    const inserted = this.#tree.set(value, insertedElem, false)
    if (!inserted) {
      // The value was already present in the tree
      // ignore this insertions since we don't support overwrites!
      return result
    }

    if (this.#tree.size - 1 < this.#topKStart) {
      // We don't have a topK yet
      // so we don't need to do anything
      return result
    }

    if (this.#topKFirstElem) {
      // We have a topK containing at least 1 element
      if (this.#comparator(value, getValue(this.#topKFirstElem)) < 0) {
        // The element was inserted before the topK
        // so it moves the element that is right before the topK into the topK
        const firstElem = getValue(this.#topKFirstElem)
        const [, newFirstElem] = this.#tree.nextLowerPair(firstElem)!
        this.#topKFirstElem = newFirstElem
        result.moveIn = this.#topKFirstElem
      } else if (
        !this.#topKLastElem ||
        this.#comparator(value, getValue(this.#topKLastElem)) < 0
      ) {
        // The element was inserted within the topK
        result.moveIn = insertedElem
      }

      if (
        this.#topKLastElem &&
        this.#comparator(value, getValue(this.#topKLastElem)) < 0
      ) {
        // The element was inserted before or within the topK
        // the newly inserted element pushes the last element of the topK out of the topK
        // so the one before that becomes the new last element of the topK
        const lastElem = this.#topKLastElem
        const lastValue = getValue(lastElem)
        const [, newLastElem] = this.#tree.nextLowerPair(lastValue)!
        this.#topKLastElem = newLastElem
        result.moveOut = lastElem
      }
    }

    // If the tree has as many elements as the offset (i.e. #topKStart)
    // then the insertion shifted the elements 1 position to the right
    // and the last element in the tree is now the first element of the topK
    if (this.#tree.size - 1 === this.#topKStart) {
      const topKFirstKey = this.#tree.maxKey()!
      this.#topKFirstElem = this.#tree.get(topKFirstKey)!
      result.moveIn = this.#topKFirstElem
    }

    // By inserting this new element we now have a complete topK
    // store the last element of the topK
    if (this.#tree.size === this.#topKEnd) {
      const topKLastKey = this.#tree.maxKey()!
      this.#topKLastElem = this.#tree.get(topKLastKey)!
    }

    return result
  }

  delete(value: V): TopKChanges<V> {
    const result: TopKChanges<V> = { moveIn: null, moveOut: null }

    const deletedElem = this.#tree.get(value)
    const deleted = this.#tree.delete(value)
    if (!deleted) {
      return result
    }

    if (!this.#topKFirstElem) {
      // We didn't have a topK before the delete
      // so we still can't have a topK after the delete
      return result
    }

    if (this.#comparator(value, getValue(this.#topKFirstElem)) < 0) {
      // We deleted an element that was before the topK
      // so the topK has shifted one position to the left

      // the old first element moves out of the topK
      result.moveOut = this.#topKFirstElem
      // the element that was right after the first element of the topK
      // is now the new first element of the topK
      const firstElem = getValue(this.#topKFirstElem)
      const [, newFirstElem] = this.#tree.nextHigherPair(firstElem) ?? [
        null,
        null,
      ]
      this.#topKFirstElem = newFirstElem
    } else if (
      !this.#topKLastElem ||
      // TODO: if on equal order the element is inserted *after* the already existing one
      //       then this check should become < 0
      this.#comparator(value, getValue(this.#topKLastElem)) <= 0
    ) {
      // The element we deleted was within the topK
      // so we need to signal that that element is no longer in the topK
      result.moveOut = deletedElem!
    }

    if (
      this.#topKLastElem &&
      // TODO: if on equal order the element is inserted *after* the already existing one
      //       then this check should become < 0
      this.#comparator(value, getValue(this.#topKLastElem)) <= 0
    ) {
      // The element we deleted was before or within the topK
      // So the first element after the topK moved one position to the left
      // and thus falls into the topK now
      const lastElem = this.#topKLastElem
      const lastValue = getValue(lastElem)
      const [, newLastElem] = this.#tree.nextHigherPair(lastValue) ?? [
        null,
        null,
      ]
      this.#topKLastElem = newLastElem
      if (newLastElem) {
        result.moveIn = newLastElem
      }
    }

    return result
  }
}

/**
 * Operator for fractional indexed topK operations
 * This operator maintains fractional indices for sorted elements
 * and only updates indices when elements move position
 */
export class TopKWithFractionalIndexBTreeOperator<
  K extends string | number,
  T,
> extends TopKWithFractionalIndexOperator<K, T> {
  protected override createTopK(
    offset: number,
    limit: number,
    comparator: (a: [K, T], b: [K, T]) => number,
  ): TopK<[K, T]> {
    if (BTree === undefined) {
      throw new Error(
        `B+ tree not loaded. You need to call loadBTree() before using TopKWithFractionalIndexBTreeOperator.`,
      )
    }
    return new TopKTree(offset, limit, comparator)
  }
}

/**
 * Limits the number of results based on a comparator, with optional offset.
 * This works on a keyed stream, where the key is the first element of the tuple.
 * The ordering is within a key group, i.e. elements are sorted within a key group
 * and the limit + offset is applied to that sorted group.
 * To order the entire stream, key by the same value for all elements such as null.
 *
 * Uses fractional indexing to minimize the number of changes when elements move positions.
 * Each element is assigned a fractional index that is lexicographically sortable.
 * When elements move, only the indices of the moved elements are updated, not all elements.
 *
 * @param comparator - A function that compares two elements
 * @param options - An optional object containing limit and offset properties
 * @returns A piped operator that orders the elements and limits the number of results
 */
export function topKWithFractionalIndexBTree<KType extends string | number, T>(
  comparator: (a: T, b: T) => number,
  options?: TopKWithFractionalIndexOptions,
): PipedOperator<[KType, T], [KType, IndexedValue<T>]> {
  const opts = options || {}

  if (BTree === undefined) {
    throw new Error(
      `B+ tree not loaded. You need to call loadBTree() before using topKWithFractionalIndexBTree.`,
    )
  }

  return (
    stream: IStreamBuilder<[KType, T]>,
  ): IStreamBuilder<[KType, IndexedValue<T>]> => {
    const output = new StreamBuilder<[KType, IndexedValue<T>]>(
      stream.graph,
      new DifferenceStreamWriter<[KType, IndexedValue<T>]>(),
    )
    const operator = new TopKWithFractionalIndexBTreeOperator<KType, T>(
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
