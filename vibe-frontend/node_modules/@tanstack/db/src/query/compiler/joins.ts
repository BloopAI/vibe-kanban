import { filter, join as joinOperator, map, tap } from '@tanstack/db-ivm'
import {
  CollectionInputNotFoundError,
  InvalidJoinCondition,
  InvalidJoinConditionLeftSourceError,
  InvalidJoinConditionRightSourceError,
  InvalidJoinConditionSameSourceError,
  InvalidJoinConditionSourceMismatchError,
  JoinCollectionNotFoundError,
  SubscriptionNotFoundError,
  UnsupportedJoinSourceTypeError,
  UnsupportedJoinTypeError,
} from '../../errors.js'
import { ensureIndexForField } from '../../indexes/auto-index.js'
import { PropRef, followRef } from '../ir.js'
import { inArray } from '../builder/functions.js'
import { compileExpression } from './evaluators.js'
import type { CompileQueryFn } from './index.js'
import type { OrderByOptimizationInfo } from './order-by.js'
import type {
  BasicExpression,
  CollectionRef,
  JoinClause,
  QueryIR,
  QueryRef,
} from '../ir.js'
import type { IStreamBuilder, JoinType } from '@tanstack/db-ivm'
import type { Collection } from '../../collection/index.js'
import type {
  KeyedStream,
  NamespacedAndKeyedStream,
  NamespacedRow,
} from '../../types.js'
import type { QueryCache, QueryMapping, WindowOptions } from './types.js'
import type { CollectionSubscription } from '../../collection/subscription.js'

/** Function type for loading specific keys into a lazy collection */
export type LoadKeysFn = (key: Set<string | number>) => void

/** Callbacks for managing lazy-loaded collections in optimized joins */
export type LazyCollectionCallbacks = {
  loadKeys: LoadKeysFn
  loadInitialState: () => void
}

/**
 * Processes all join clauses, applying lazy loading optimizations and maintaining
 * alias tracking for per-alias subscriptions (enables self-joins).
 */
export function processJoins(
  pipeline: NamespacedAndKeyedStream,
  joinClauses: Array<JoinClause>,
  sources: Record<string, KeyedStream>,
  mainCollectionId: string,
  mainSource: string,
  allInputs: Record<string, KeyedStream>,
  cache: QueryCache,
  queryMapping: QueryMapping,
  collections: Record<string, Collection>,
  subscriptions: Record<string, CollectionSubscription>,
  callbacks: Record<string, LazyCollectionCallbacks>,
  lazySources: Set<string>,
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>,
  setWindowFn: (windowFn: (options: WindowOptions) => void) => void,
  rawQuery: QueryIR,
  onCompileSubquery: CompileQueryFn,
  aliasToCollectionId: Record<string, string>,
  aliasRemapping: Record<string, string>,
): NamespacedAndKeyedStream {
  let resultPipeline = pipeline

  for (const joinClause of joinClauses) {
    resultPipeline = processJoin(
      resultPipeline,
      joinClause,
      sources,
      mainCollectionId,
      mainSource,
      allInputs,
      cache,
      queryMapping,
      collections,
      subscriptions,
      callbacks,
      lazySources,
      optimizableOrderByCollections,
      setWindowFn,
      rawQuery,
      onCompileSubquery,
      aliasToCollectionId,
      aliasRemapping,
    )
  }

  return resultPipeline
}

/**
 * Processes a single join clause with lazy loading optimization.
 * For LEFT/RIGHT/INNER joins, marks one side as "lazy" (loads on-demand based on join keys).
 */
function processJoin(
  pipeline: NamespacedAndKeyedStream,
  joinClause: JoinClause,
  sources: Record<string, KeyedStream>,
  mainCollectionId: string,
  mainSource: string,
  allInputs: Record<string, KeyedStream>,
  cache: QueryCache,
  queryMapping: QueryMapping,
  collections: Record<string, Collection>,
  subscriptions: Record<string, CollectionSubscription>,
  callbacks: Record<string, LazyCollectionCallbacks>,
  lazySources: Set<string>,
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>,
  setWindowFn: (windowFn: (options: WindowOptions) => void) => void,
  rawQuery: QueryIR,
  onCompileSubquery: CompileQueryFn,
  aliasToCollectionId: Record<string, string>,
  aliasRemapping: Record<string, string>,
): NamespacedAndKeyedStream {
  const isCollectionRef = joinClause.from.type === `collectionRef`

  // Get the joined source alias and input stream
  const {
    alias: joinedSource,
    input: joinedInput,
    collectionId: joinedCollectionId,
  } = processJoinSource(
    joinClause.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    onCompileSubquery,
    aliasToCollectionId,
    aliasRemapping,
  )

  // Add the joined source to the sources map
  sources[joinedSource] = joinedInput
  if (isCollectionRef) {
    // Only direct collection references form new alias bindings. Subquery
    // aliases reuse the mapping returned from the recursive compilation above.
    aliasToCollectionId[joinedSource] = joinedCollectionId
  }

  const mainCollection = collections[mainCollectionId]
  const joinedCollection = collections[joinedCollectionId]

  if (!mainCollection) {
    throw new JoinCollectionNotFoundError(mainCollectionId)
  }

  if (!joinedCollection) {
    throw new JoinCollectionNotFoundError(joinedCollectionId)
  }

  const { activeSource, lazySource } = getActiveAndLazySources(
    joinClause.type,
    mainCollection,
    joinedCollection,
  )

  // Analyze which source each expression refers to and swap if necessary
  const availableSources = Object.keys(sources)
  const { mainExpr, joinedExpr } = analyzeJoinExpressions(
    joinClause.left,
    joinClause.right,
    availableSources,
    joinedSource,
  )

  // Pre-compile the join expressions
  const compiledMainExpr = compileExpression(mainExpr)
  const compiledJoinedExpr = compileExpression(joinedExpr)

  // Prepare the main pipeline for joining
  let mainPipeline = pipeline.pipe(
    map(([currentKey, namespacedRow]) => {
      // Extract the join key from the main source expression
      const mainKey = compiledMainExpr(namespacedRow)

      // Return [joinKey, [originalKey, namespacedRow]]
      return [mainKey, [currentKey, namespacedRow]] as [
        unknown,
        [string, typeof namespacedRow],
      ]
    }),
  )

  // Prepare the joined pipeline
  let joinedPipeline = joinedInput.pipe(
    map(([currentKey, row]) => {
      // Wrap the row in a namespaced structure
      const namespacedRow: NamespacedRow = { [joinedSource]: row }

      // Extract the join key from the joined source expression
      const joinedKey = compiledJoinedExpr(namespacedRow)

      // Return [joinKey, [originalKey, namespacedRow]]
      return [joinedKey, [currentKey, namespacedRow]] as [
        unknown,
        [string, typeof namespacedRow],
      ]
    }),
  )

  // Apply the join operation
  if (![`inner`, `left`, `right`, `full`].includes(joinClause.type)) {
    throw new UnsupportedJoinTypeError(joinClause.type)
  }

  if (activeSource) {
    // If the lazy collection comes from a subquery that has a limit and/or an offset clause
    // then we need to deoptimize the join because we don't know which rows are in the result set
    // since we simply lookup matching keys in the index but the index contains all rows
    // (not just the ones that pass the limit and offset clauses)
    const lazyFrom = activeSource === `main` ? joinClause.from : rawQuery.from
    const limitedSubquery =
      lazyFrom.type === `queryRef` &&
      (lazyFrom.query.limit || lazyFrom.query.offset)

    // If join expressions contain computed values (like concat functions)
    // we don't optimize the join because we don't have an index over the computed values
    const hasComputedJoinExpr =
      mainExpr.type === `func` || joinedExpr.type === `func`

    if (!limitedSubquery && !hasComputedJoinExpr) {
      // This join can be optimized by having the active collection
      // dynamically load keys into the lazy collection
      // based on the value of the joinKey and by looking up
      // matching rows in the index of the lazy collection

      // Mark the lazy source alias as lazy
      // this Set is passed by the liveQueryCollection to the compiler
      // such that the liveQueryCollection can check it after compilation
      // to know which source aliases should load data lazily (not initially)
      const lazyAlias = activeSource === `main` ? joinedSource : mainSource
      lazySources.add(lazyAlias)

      const activePipeline =
        activeSource === `main` ? mainPipeline : joinedPipeline

      const lazySourceJoinExpr =
        activeSource === `main`
          ? (joinedExpr as PropRef)
          : (mainExpr as PropRef)

      const followRefResult = followRef(
        rawQuery,
        lazySourceJoinExpr,
        lazySource,
      )!
      const followRefCollection = followRefResult.collection

      const fieldName = followRefResult.path[0]
      if (fieldName) {
        ensureIndexForField(
          fieldName,
          followRefResult.path,
          followRefCollection,
        )
      }

      // Set up lazy loading: intercept active side's stream and dynamically load
      // matching rows from lazy side based on join keys.
      const activePipelineWithLoading: IStreamBuilder<
        [key: unknown, [originalKey: string, namespacedRow: NamespacedRow]]
      > = activePipeline.pipe(
        tap((data) => {
          // Find the subscription for lazy loading.
          // Subscriptions are keyed by the innermost alias (where the collection subscription
          // was actually created). For subqueries, the join alias may differ from the inner alias.
          // aliasRemapping provides a flattened one-hop lookup from outer → innermost alias.
          // Example: .join({ activeUser: subquery }) where subquery uses .from({ user: collection })
          // → aliasRemapping['activeUser'] = 'user' (always maps directly to innermost, never recursive)
          const resolvedAlias = aliasRemapping[lazyAlias] || lazyAlias
          const lazySourceSubscription = subscriptions[resolvedAlias]

          if (!lazySourceSubscription) {
            throw new SubscriptionNotFoundError(
              resolvedAlias,
              lazyAlias,
              lazySource.id,
              Object.keys(subscriptions),
            )
          }

          if (lazySourceSubscription.hasLoadedInitialState()) {
            // Entire state was already loaded because we deoptimized the join
            return
          }

          // Request filtered snapshot from lazy collection for matching join keys
          const joinKeys = data.getInner().map(([[joinKey]]) => joinKey)
          const lazyJoinRef = new PropRef(followRefResult.path)
          const loaded = lazySourceSubscription.requestSnapshot({
            where: inArray(lazyJoinRef, joinKeys),
            optimizedOnly: true,
          })

          if (!loaded) {
            // Snapshot wasn't sent because it could not be loaded from the indexes
            lazySourceSubscription.requestSnapshot()
          }
        }),
      )

      if (activeSource === `main`) {
        mainPipeline = activePipelineWithLoading
      } else {
        joinedPipeline = activePipelineWithLoading
      }
    }
  }

  return mainPipeline.pipe(
    joinOperator(joinedPipeline, joinClause.type as JoinType),
    processJoinResults(joinClause.type),
  )
}

/**
 * Analyzes join expressions to determine which refers to which source
 * and returns them in the correct order (available source expression first, joined source expression second)
 */
function analyzeJoinExpressions(
  left: BasicExpression,
  right: BasicExpression,
  allAvailableSourceAliases: Array<string>,
  joinedSource: string,
): { mainExpr: BasicExpression; joinedExpr: BasicExpression } {
  // Filter out the joined source alias from the available source aliases
  const availableSources = allAvailableSourceAliases.filter(
    (alias) => alias !== joinedSource,
  )

  const leftSourceAlias = getSourceAliasFromExpression(left)
  const rightSourceAlias = getSourceAliasFromExpression(right)

  // If left expression refers to an available source and right refers to joined source, keep as is
  if (
    leftSourceAlias &&
    availableSources.includes(leftSourceAlias) &&
    rightSourceAlias === joinedSource
  ) {
    return { mainExpr: left, joinedExpr: right }
  }

  // If left expression refers to joined source and right refers to an available source, swap them
  if (
    leftSourceAlias === joinedSource &&
    rightSourceAlias &&
    availableSources.includes(rightSourceAlias)
  ) {
    return { mainExpr: right, joinedExpr: left }
  }

  // If one expression doesn't refer to any source, this is an invalid join
  if (!leftSourceAlias || !rightSourceAlias) {
    throw new InvalidJoinConditionSourceMismatchError()
  }

  // If both expressions refer to the same alias, this is an invalid join
  if (leftSourceAlias === rightSourceAlias) {
    throw new InvalidJoinConditionSameSourceError(leftSourceAlias)
  }

  // Left side must refer to an available source
  // This cannot happen with the query builder as there is no way to build a ref
  // to an unavailable source, but just in case, but could happen with the IR
  if (!availableSources.includes(leftSourceAlias)) {
    throw new InvalidJoinConditionLeftSourceError(leftSourceAlias)
  }

  // Right side must refer to the joined source
  if (rightSourceAlias !== joinedSource) {
    throw new InvalidJoinConditionRightSourceError(joinedSource)
  }

  // This should not be reachable given the logic above, but just in case
  throw new InvalidJoinCondition()
}

/**
 * Extracts the source alias from a join expression
 */
function getSourceAliasFromExpression(expr: BasicExpression): string | null {
  switch (expr.type) {
    case `ref`:
      // PropRef path has the source alias as the first element
      return expr.path[0] || null
    case `func`: {
      // For function expressions, we need to check if all arguments refer to the same source
      const sourceAliases = new Set<string>()
      for (const arg of expr.args) {
        const alias = getSourceAliasFromExpression(arg)
        if (alias) {
          sourceAliases.add(alias)
        }
      }
      // If all arguments refer to the same source, return that source alias
      return sourceAliases.size === 1 ? Array.from(sourceAliases)[0]! : null
    }
    default:
      // Values (type='val') don't reference any source
      return null
  }
}

/**
 * Processes the join source (collection or sub-query)
 */
function processJoinSource(
  from: CollectionRef | QueryRef,
  allInputs: Record<string, KeyedStream>,
  collections: Record<string, Collection>,
  subscriptions: Record<string, CollectionSubscription>,
  callbacks: Record<string, LazyCollectionCallbacks>,
  lazySources: Set<string>,
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>,
  setWindowFn: (windowFn: (options: WindowOptions) => void) => void,
  cache: QueryCache,
  queryMapping: QueryMapping,
  onCompileSubquery: CompileQueryFn,
  aliasToCollectionId: Record<string, string>,
  aliasRemapping: Record<string, string>,
): { alias: string; input: KeyedStream; collectionId: string } {
  switch (from.type) {
    case `collectionRef`: {
      const input = allInputs[from.alias]
      if (!input) {
        throw new CollectionInputNotFoundError(
          from.alias,
          from.collection.id,
          Object.keys(allInputs),
        )
      }
      aliasToCollectionId[from.alias] = from.collection.id
      return { alias: from.alias, input, collectionId: from.collection.id }
    }
    case `queryRef`: {
      // Find the original query for caching purposes
      const originalQuery = queryMapping.get(from.query) || from.query

      // Recursively compile the sub-query with cache
      const subQueryResult = onCompileSubquery(
        originalQuery,
        allInputs,
        collections,
        subscriptions,
        callbacks,
        lazySources,
        optimizableOrderByCollections,
        setWindowFn,
        cache,
        queryMapping,
      )

      // Pull up alias mappings from subquery to parent scope.
      // This includes both the innermost alias-to-collection mappings AND
      // any existing remappings from nested subquery levels.
      Object.assign(aliasToCollectionId, subQueryResult.aliasToCollectionId)
      Object.assign(aliasRemapping, subQueryResult.aliasRemapping)

      // Create a flattened remapping from outer alias to innermost alias.
      // For nested subqueries, this ensures one-hop lookups (not recursive chains).
      //
      // Example with 3-level nesting:
      //   Inner:  .from({ user: usersCollection })
      //   Middle: .from({ activeUser: innerSubquery })     → creates: activeUser → user
      //   Outer:  .join({ author: middleSubquery }, ...)   → creates: author → user (not author → activeUser)
      //
      // We search through the PULLED-UP aliasToCollectionId (which contains the
      // innermost 'user' alias), so we always map directly to the deepest level.
      // This means aliasRemapping[lazyAlias] is always a single lookup, never recursive.
      const innerAlias = Object.keys(subQueryResult.aliasToCollectionId).find(
        (alias) =>
          subQueryResult.aliasToCollectionId[alias] ===
          subQueryResult.collectionId,
      )
      if (innerAlias && innerAlias !== from.alias) {
        aliasRemapping[from.alias] = innerAlias
      }

      // Extract the pipeline from the compilation result
      const subQueryInput = subQueryResult.pipeline

      // Subqueries may return [key, [value, orderByIndex]] (with ORDER BY) or [key, value] (without ORDER BY)
      // We need to extract just the value for use in parent queries
      const extractedInput = subQueryInput.pipe(
        map((data: any) => {
          const [key, [value, _orderByIndex]] = data
          return [key, value] as [unknown, any]
        }),
      )

      return {
        alias: from.alias,
        input: extractedInput as KeyedStream,
        collectionId: subQueryResult.collectionId,
      }
    }
    default:
      throw new UnsupportedJoinSourceTypeError((from as any).type)
  }
}

/**
 * Processes the results of a join operation
 */
function processJoinResults(joinType: string) {
  return function (
    pipeline: IStreamBuilder<
      [
        key: string,
        [
          [string, NamespacedRow] | undefined,
          [string, NamespacedRow] | undefined,
        ],
      ]
    >,
  ): NamespacedAndKeyedStream {
    return pipeline.pipe(
      // Process the join result and handle nulls
      filter((result) => {
        const [_key, [main, joined]] = result
        const mainNamespacedRow = main?.[1]
        const joinedNamespacedRow = joined?.[1]

        // Handle different join types
        if (joinType === `inner`) {
          return !!(mainNamespacedRow && joinedNamespacedRow)
        }

        if (joinType === `left`) {
          return !!mainNamespacedRow
        }

        if (joinType === `right`) {
          return !!joinedNamespacedRow
        }

        // For full joins, always include
        return true
      }),
      map((result) => {
        const [_key, [main, joined]] = result
        const mainKey = main?.[0]
        const mainNamespacedRow = main?.[1]
        const joinedKey = joined?.[0]
        const joinedNamespacedRow = joined?.[1]

        // Merge the namespaced rows
        const mergedNamespacedRow: NamespacedRow = {}

        // Add main row data if it exists
        if (mainNamespacedRow) {
          Object.assign(mergedNamespacedRow, mainNamespacedRow)
        }

        // Add joined row data if it exists
        if (joinedNamespacedRow) {
          Object.assign(mergedNamespacedRow, joinedNamespacedRow)
        }

        // We create a composite key that combines the main and joined keys
        const resultKey = `[${mainKey},${joinedKey}]`

        return [resultKey, mergedNamespacedRow] as [string, NamespacedRow]
      }),
    )
  }
}

/**
 * Returns the active and lazy collections for a join clause.
 * The active collection is the one that we need to fully iterate over
 * and it can be the main source (i.e. left collection) or the joined source (i.e. right collection).
 * The lazy collection is the one that we should join-in lazily based on matches in the active collection.
 * @param joinClause - The join clause to analyze
 * @param leftCollection - The left collection
 * @param rightCollection - The right collection
 * @returns The active and lazy collections. They are undefined if we need to loop over both collections (i.e. both are active)
 */
function getActiveAndLazySources(
  joinType: JoinClause[`type`],
  leftCollection: Collection,
  rightCollection: Collection,
):
  | { activeSource: `main` | `joined`; lazySource: Collection }
  | { activeSource: undefined; lazySource: undefined } {
  // Self-joins can now be optimized since we track lazy loading by source alias
  // rather than collection ID. Each alias has its own subscription and lazy state.

  switch (joinType) {
    case `left`:
      return { activeSource: `main`, lazySource: rightCollection }
    case `right`:
      return { activeSource: `joined`, lazySource: leftCollection }
    case `inner`:
      // The smallest collection should be the active collection
      // and the biggest collection should be lazy
      return leftCollection.size < rightCollection.size
        ? { activeSource: `main`, lazySource: rightCollection }
        : { activeSource: `joined`, lazySource: leftCollection }
    default:
      return { activeSource: undefined, lazySource: undefined }
  }
}
