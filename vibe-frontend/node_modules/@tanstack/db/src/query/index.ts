// Main exports for the new query builder system

// Query builder exports
export {
  BaseQueryBuilder,
  Query,
  type InitialQueryBuilder,
  type QueryBuilder,
  type Context,
  type Source,
  type GetResult,
  type InferResultType,
} from './builder/index.js'

// Expression functions exports
export {
  // Operators
  eq,
  gt,
  gte,
  lt,
  lte,
  and,
  or,
  not,
  inArray,
  like,
  ilike,
  isUndefined,
  isNull,
  // Functions
  upper,
  lower,
  length,
  concat,
  coalesce,
  add,
  // Aggregates
  count,
  avg,
  sum,
  min,
  max,
} from './builder/functions.js'

// Ref proxy utilities
export type { Ref } from './builder/types.js'

// Compiler
export { compileQuery } from './compiler/index.js'

// Live query collection utilities
export {
  createLiveQueryCollection,
  liveQueryCollectionOptions,
} from './live-query-collection.js'

export { type LiveQueryCollectionConfig } from './live/types.js'
export { type LiveQueryCollectionUtils } from './live/collection-config-builder.js'

// Predicate utilities for predicate push-down
export {
  isWhereSubset,
  unionWherePredicates,
  minusWherePredicates,
  isOrderBySubset,
  isLimitSubset,
  isOffsetLimitSubset,
  isPredicateSubset,
} from './predicate-utils.js'

export { DeduplicatedLoadSubset } from './subset-dedupe.js'
