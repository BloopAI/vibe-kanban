import { IndexProxy, LazyIndexWrapper } from '../indexes/lazy-index'
import {
  createSingleRowRefProxy,
  toExpression,
} from '../query/builder/ref-proxy'
import { BTreeIndex } from '../indexes/btree-index'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { BaseIndex, IndexResolver } from '../indexes/base-index'
import type { ChangeMessage } from '../types'
import type { IndexOptions } from '../indexes/index-options'
import type { SingleRowRefProxy } from '../query/builder/ref-proxy'
import type { CollectionLifecycleManager } from './lifecycle'
import type { CollectionStateManager } from './state'

export class CollectionIndexesManager<
  TOutput extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
  TInput extends object = TOutput,
> {
  private lifecycle!: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  private state!: CollectionStateManager<TOutput, TKey, TSchema, TInput>

  public lazyIndexes = new Map<number, LazyIndexWrapper<TKey>>()
  public resolvedIndexes = new Map<number, BaseIndex<TKey>>()
  public isIndexesResolved = false
  public indexCounter = 0

  constructor() {}

  setDeps(deps: {
    state: CollectionStateManager<TOutput, TKey, TSchema, TInput>
    lifecycle: CollectionLifecycleManager<TOutput, TKey, TSchema, TInput>
  }) {
    this.state = deps.state
    this.lifecycle = deps.lifecycle
  }

  /**
   * Creates an index on a collection for faster queries.
   */
  public createIndex<TResolver extends IndexResolver<TKey> = typeof BTreeIndex>(
    indexCallback: (row: SingleRowRefProxy<TOutput>) => any,
    config: IndexOptions<TResolver> = {},
  ): IndexProxy<TKey> {
    this.lifecycle.validateCollectionUsable(`createIndex`)

    const indexId = ++this.indexCounter
    const singleRowRefProxy = createSingleRowRefProxy<TOutput>()
    const indexExpression = indexCallback(singleRowRefProxy)
    const expression = toExpression(indexExpression)

    // Default to BTreeIndex if no type specified
    const resolver = config.indexType ?? (BTreeIndex as unknown as TResolver)

    // Create lazy wrapper
    const lazyIndex = new LazyIndexWrapper<TKey>(
      indexId,
      expression,
      config.name,
      resolver,
      config.options,
      this.state.entries(),
    )

    this.lazyIndexes.set(indexId, lazyIndex)

    // For BTreeIndex, resolve immediately and synchronously
    if ((resolver as unknown) === BTreeIndex) {
      try {
        const resolvedIndex = lazyIndex.getResolved()
        this.resolvedIndexes.set(indexId, resolvedIndex)
      } catch (error) {
        console.warn(`Failed to resolve BTreeIndex:`, error)
      }
    } else if (typeof resolver === `function` && resolver.prototype) {
      // Other synchronous constructors - resolve immediately
      try {
        const resolvedIndex = lazyIndex.getResolved()
        this.resolvedIndexes.set(indexId, resolvedIndex)
      } catch {
        // Fallback to async resolution
        this.resolveSingleIndex(indexId, lazyIndex).catch((error) => {
          console.warn(`Failed to resolve single index:`, error)
        })
      }
    } else if (this.isIndexesResolved) {
      // Async loader but indexes are already resolved - resolve this one
      this.resolveSingleIndex(indexId, lazyIndex).catch((error) => {
        console.warn(`Failed to resolve single index:`, error)
      })
    }

    return new IndexProxy(indexId, lazyIndex)
  }

  /**
   * Resolve all lazy indexes (called when collection first syncs)
   */
  public async resolveAllIndexes(): Promise<void> {
    if (this.isIndexesResolved) return

    const resolutionPromises = Array.from(this.lazyIndexes.entries()).map(
      async ([indexId, lazyIndex]) => {
        const resolvedIndex = await lazyIndex.resolve()

        // Build index with current data
        resolvedIndex.build(this.state.entries())

        this.resolvedIndexes.set(indexId, resolvedIndex)
        return { indexId, resolvedIndex }
      },
    )

    await Promise.all(resolutionPromises)
    this.isIndexesResolved = true
  }

  /**
   * Resolve a single index immediately
   */
  private async resolveSingleIndex(
    indexId: number,
    lazyIndex: LazyIndexWrapper<TKey>,
  ): Promise<BaseIndex<TKey>> {
    const resolvedIndex = await lazyIndex.resolve()
    resolvedIndex.build(this.state.entries())
    this.resolvedIndexes.set(indexId, resolvedIndex)
    return resolvedIndex
  }

  /**
   * Get resolved indexes for query optimization
   */
  get indexes(): Map<number, BaseIndex<TKey>> {
    return this.resolvedIndexes
  }

  /**
   * Updates all indexes when the collection changes
   */
  public updateIndexes(changes: Array<ChangeMessage<TOutput, TKey>>): void {
    for (const index of this.resolvedIndexes.values()) {
      for (const change of changes) {
        switch (change.type) {
          case `insert`:
            index.add(change.key, change.value)
            break
          case `update`:
            if (change.previousValue) {
              index.update(change.key, change.previousValue, change.value)
            } else {
              index.add(change.key, change.value)
            }
            break
          case `delete`:
            index.remove(change.key, change.value)
            break
        }
      }
    }
  }

  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  public cleanup(): void {
    this.lazyIndexes.clear()
    this.resolvedIndexes.clear()
  }
}
