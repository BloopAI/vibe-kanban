import type { IndexConstructor, IndexResolver } from './base-index.js'

/**
 * Enhanced index options that support both sync and async resolvers
 */
export interface IndexOptions<TResolver extends IndexResolver = IndexResolver> {
  name?: string
  indexType?: TResolver
  options?: TResolver extends IndexConstructor<any>
    ? TResolver extends new (
        id: number,
        expr: any,
        name?: string,
        options?: infer O,
      ) => any
      ? O
      : never
    : TResolver extends () => Promise<infer TCtor>
      ? TCtor extends new (
          id: number,
          expr: any,
          name?: string,
          options?: infer O,
        ) => any
        ? O
        : never
      : never
}

/**
 * Utility type to extract the constructed index type from a resolver
 */
export type ResolvedIndexType<TResolver extends IndexResolver> =
  TResolver extends IndexConstructor<any>
    ? InstanceType<TResolver>
    : TResolver extends () => Promise<IndexConstructor<any>>
      ? TResolver extends () => Promise<infer TCtor>
        ? TCtor extends IndexConstructor<any>
          ? InstanceType<TCtor>
          : never
        : never
      : never
