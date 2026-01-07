import type {
  BaseIndex,
  IndexConstructor,
  IndexResolver,
} from './base-index.js'
import type { BasicExpression } from '../query/ir.js'

/**
 * Utility to determine if a resolver is a constructor or async loader
 */
function isConstructor<TKey extends string | number>(
  resolver: IndexResolver<TKey>,
): resolver is IndexConstructor<TKey> {
  // Check if it's a function with a prototype (constructor)
  return (
    typeof resolver === `function` &&
    resolver.prototype !== undefined &&
    resolver.prototype.constructor === resolver
  )
}

/**
 * Resolve index constructor from resolver
 */
async function resolveIndexConstructor<TKey extends string | number>(
  resolver: IndexResolver<TKey>,
): Promise<IndexConstructor<TKey>> {
  if (isConstructor(resolver)) {
    return resolver
  } else {
    // It's an async loader function
    return await resolver()
  }
}

/**
 * Wrapper that defers index creation until first sync
 */
export class LazyIndexWrapper<TKey extends string | number = string | number> {
  private indexPromise: Promise<BaseIndex<TKey>> | null = null
  private resolvedIndex: BaseIndex<TKey> | null = null

  constructor(
    private id: number,
    private expression: BasicExpression,
    private name: string | undefined,
    private resolver: IndexResolver<TKey>,
    private options: any,
    private collectionEntries?: Iterable<[TKey, any]>,
  ) {
    // For synchronous constructors, resolve immediately
    if (isConstructor(this.resolver)) {
      this.resolvedIndex = new this.resolver(
        this.id,
        this.expression,
        this.name,
        this.options,
      )
      // Build with initial data if provided
      if (this.collectionEntries) {
        this.resolvedIndex.build(this.collectionEntries)
      }
    }
  }

  /**
   * Resolve the actual index
   */
  async resolve(): Promise<BaseIndex<TKey>> {
    if (this.resolvedIndex) {
      return this.resolvedIndex
    }

    if (!this.indexPromise) {
      this.indexPromise = this.createIndex()
    }

    this.resolvedIndex = await this.indexPromise
    return this.resolvedIndex
  }

  /**
   * Check if already resolved
   */
  isResolved(): boolean {
    return this.resolvedIndex !== null
  }

  /**
   * Get resolved index (throws if not ready)
   */
  getResolved(): BaseIndex<TKey> {
    if (!this.resolvedIndex) {
      throw new Error(
        `Index ${this.id} has not been resolved yet. Ensure collection is synced.`,
      )
    }
    return this.resolvedIndex
  }

  /**
   * Get the index ID
   */
  getId(): number {
    return this.id
  }

  /**
   * Get the index name
   */
  getName(): string | undefined {
    return this.name
  }

  /**
   * Get the index expression
   */
  getExpression(): BasicExpression {
    return this.expression
  }

  private async createIndex(): Promise<BaseIndex<TKey>> {
    const IndexClass = await resolveIndexConstructor(this.resolver)
    return new IndexClass(this.id, this.expression, this.name, this.options)
  }
}

/**
 * Proxy that provides synchronous interface while index loads asynchronously
 */
export class IndexProxy<TKey extends string | number = string | number> {
  constructor(
    private indexId: number,
    private lazyIndex: LazyIndexWrapper<TKey>,
  ) {}

  /**
   * Get the resolved index (throws if not ready)
   */
  get index(): BaseIndex<TKey> {
    return this.lazyIndex.getResolved()
  }

  /**
   * Check if index is ready
   */
  get isReady(): boolean {
    return this.lazyIndex.isResolved()
  }

  /**
   * Wait for index to be ready
   */
  async whenReady(): Promise<BaseIndex<TKey>> {
    return await this.lazyIndex.resolve()
  }

  /**
   * Get the index ID
   */
  get id(): number {
    return this.indexId
  }

  /**
   * Get the index name (throws if not ready)
   */
  get name(): string | undefined {
    if (this.isReady) {
      return this.index.name
    }
    return this.lazyIndex.getName()
  }

  /**
   * Get the index expression (available immediately)
   */
  get expression(): BasicExpression {
    return this.lazyIndex.getExpression()
  }

  /**
   * Check if index supports an operation (throws if not ready)
   */
  supports(operation: any): boolean {
    return this.index.supports(operation)
  }

  /**
   * Get index statistics (throws if not ready)
   */
  getStats() {
    return this.index.getStats()
  }

  /**
   * Check if index matches a field path (available immediately)
   */
  matchesField(fieldPath: Array<string>): boolean {
    const expr = this.expression
    return (
      expr.type === `ref` &&
      expr.path.length === fieldPath.length &&
      expr.path.every((part, i) => part === fieldPath[i])
    )
  }

  /**
   * Get the key count (throws if not ready)
   */
  get keyCount(): number {
    return this.index.keyCount
  }

  // Test compatibility properties - delegate to resolved index
  get indexedKeysSet(): Set<TKey> {
    const resolved = this.index as any
    return resolved.indexedKeysSet
  }

  get orderedEntriesArray(): Array<[any, Set<TKey>]> {
    const resolved = this.index as any
    return resolved.orderedEntriesArray
  }

  get valueMapData(): Map<any, Set<TKey>> {
    const resolved = this.index as any
    return resolved.valueMapData
  }

  // BTreeIndex compatibility methods
  equalityLookup(value: any): Set<TKey> {
    const resolved = this.index as any
    return resolved.equalityLookup?.(value) ?? new Set()
  }

  rangeQuery(options: any): Set<TKey> {
    const resolved = this.index as any
    return resolved.rangeQuery?.(options) ?? new Set()
  }

  inArrayLookup(values: Array<any>): Set<TKey> {
    const resolved = this.index as any
    return resolved.inArrayLookup?.(values) ?? new Set()
  }

  // Internal method for the collection to get the lazy wrapper
  _getLazyWrapper(): LazyIndexWrapper<TKey> {
    return this.lazyIndex
  }
}
