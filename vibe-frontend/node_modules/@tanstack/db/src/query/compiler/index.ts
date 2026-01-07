import { distinct, filter, map } from '@tanstack/db-ivm'
import { optimizeQuery } from '../optimizer.js'
import {
  CollectionInputNotFoundError,
  DistinctRequiresSelectError,
  DuplicateAliasInSubqueryError,
  HavingRequiresGroupByError,
  LimitOffsetRequireOrderByError,
  UnsupportedFromTypeError,
} from '../../errors.js'
import { PropRef, Value as ValClass, getWhereExpression } from '../ir.js'
import { compileExpression, toBooleanPredicate } from './evaluators.js'
import { processJoins } from './joins.js'
import { processGroupBy } from './group-by.js'
import { processOrderBy } from './order-by.js'
import { processSelect } from './select.js'
import type { CollectionSubscription } from '../../collection/subscription.js'
import type { OrderByOptimizationInfo } from './order-by.js'
import type {
  BasicExpression,
  CollectionRef,
  QueryIR,
  QueryRef,
} from '../ir.js'
import type { LazyCollectionCallbacks } from './joins.js'
import type { Collection } from '../../collection/index.js'
import type {
  KeyedStream,
  NamespacedAndKeyedStream,
  ResultStream,
} from '../../types.js'
import type { QueryCache, QueryMapping, WindowOptions } from './types.js'

export type { WindowOptions } from './types.js'

/**
 * Result of query compilation including both the pipeline and source-specific WHERE clauses
 */
export interface CompilationResult {
  /** The ID of the main collection */
  collectionId: string

  /** The compiled query pipeline (D2 stream) */
  pipeline: ResultStream

  /** Map of source aliases to their WHERE clauses for index optimization */
  sourceWhereClauses: Map<string, BasicExpression<boolean>>

  /**
   * Maps each source alias to its collection ID. Enables per-alias subscriptions for self-joins.
   * Example: `{ employee: 'employees-col-id', manager: 'employees-col-id' }`
   */
  aliasToCollectionId: Record<string, string>

  /**
   * Flattened mapping from outer alias to innermost alias for subqueries.
   * Always provides one-hop lookups, never recursive chains.
   *
   * Example: `{ activeUser: 'user' }` when `.from({ activeUser: subquery })`
   * where the subquery uses `.from({ user: collection })`.
   *
   * For deeply nested subqueries, the mapping goes directly to the innermost alias:
   * `{ author: 'user' }` (not `{ author: 'activeUser' }`), so `aliasRemapping[alias]`
   * always resolves in a single lookup.
   *
   * Used to resolve subscriptions during lazy loading when join aliases differ from
   * the inner aliases where collection subscriptions were created.
   */
  aliasRemapping: Record<string, string>
}

/**
 * Compiles a query IR into a D2 pipeline
 * @param rawQuery The query IR to compile
 * @param inputs Mapping of source aliases to input streams (e.g., `{ employee: input1, manager: input2 }`)
 * @param collections Mapping of collection IDs to Collection instances
 * @param subscriptions Mapping of source aliases to CollectionSubscription instances
 * @param callbacks Mapping of source aliases to lazy loading callbacks
 * @param lazySources Set of source aliases that should load data lazily
 * @param optimizableOrderByCollections Map of collection IDs to order-by optimization info
 * @param cache Optional cache for compiled subqueries (used internally for recursion)
 * @param queryMapping Optional mapping from optimized queries to original queries
 * @returns A CompilationResult with the pipeline, source WHERE clauses, and alias metadata
 */
export function compileQuery(
  rawQuery: QueryIR,
  inputs: Record<string, KeyedStream>,
  collections: Record<string, Collection<any, any, any, any, any>>,
  subscriptions: Record<string, CollectionSubscription>,
  callbacks: Record<string, LazyCollectionCallbacks>,
  lazySources: Set<string>,
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>,
  setWindowFn: (windowFn: (options: WindowOptions) => void) => void,
  cache: QueryCache = new WeakMap(),
  queryMapping: QueryMapping = new WeakMap(),
): CompilationResult {
  // Check if the original raw query has already been compiled
  const cachedResult = cache.get(rawQuery)
  if (cachedResult) {
    return cachedResult
  }

  // Validate the raw query BEFORE optimization to check user's original structure.
  // This must happen before optimization because the optimizer may create internal
  // subqueries (e.g., for predicate pushdown) that reuse aliases, which is fine.
  validateQueryStructure(rawQuery)

  // Optimize the query before compilation
  const { optimizedQuery: query, sourceWhereClauses } = optimizeQuery(rawQuery)

  // Create mapping from optimized query to original for caching
  queryMapping.set(query, rawQuery)
  mapNestedQueries(query, rawQuery, queryMapping)

  // Create a copy of the inputs map to avoid modifying the original
  const allInputs = { ...inputs }

  // Track alias to collection id relationships discovered during compilation.
  // This includes all user-declared aliases plus inner aliases from subqueries.
  const aliasToCollectionId: Record<string, string> = {}

  // Track alias remapping for subqueries (outer alias → inner alias)
  // e.g., when .join({ activeUser: subquery }) where subquery uses .from({ user: collection })
  // we store: aliasRemapping['activeUser'] = 'user'
  const aliasRemapping: Record<string, string> = {}

  // Create a map of source aliases to input streams.
  // Inputs MUST be keyed by alias (e.g., `{ employee: input1, manager: input2 }`),
  // not by collection ID. This enables per-alias subscriptions where different aliases
  // of the same collection (e.g., self-joins) maintain independent filtered streams.
  const sources: Record<string, KeyedStream> = {}

  // Process the FROM clause to get the main source
  const {
    alias: mainSource,
    input: mainInput,
    collectionId: mainCollectionId,
  } = processFrom(
    query.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    aliasToCollectionId,
    aliasRemapping,
  )
  sources[mainSource] = mainInput

  // Prepare the initial pipeline with the main source wrapped in its alias
  let pipeline: NamespacedAndKeyedStream = mainInput.pipe(
    map(([key, row]) => {
      // Initialize the record with a nested structure
      const ret = [key, { [mainSource]: row }] as [
        string,
        Record<string, typeof row>,
      ]
      return ret
    }),
  )

  // Process JOIN clauses if they exist
  if (query.join && query.join.length > 0) {
    pipeline = processJoins(
      pipeline,
      query.join,
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
      compileQuery,
      aliasToCollectionId,
      aliasRemapping,
    )
  }

  // Process the WHERE clause if it exists
  if (query.where && query.where.length > 0) {
    // Apply each WHERE condition as a filter (they are ANDed together)
    for (const where of query.where) {
      const whereExpression = getWhereExpression(where)
      const compiledWhere = compileExpression(whereExpression)
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(compiledWhere(namespacedRow))
        }),
      )
    }
  }

  // Process functional WHERE clauses if they exist
  if (query.fnWhere && query.fnWhere.length > 0) {
    for (const fnWhere of query.fnWhere) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(fnWhere(namespacedRow))
        }),
      )
    }
  }

  if (query.distinct && !query.fnSelect && !query.select) {
    throw new DistinctRequiresSelectError()
  }

  // Process the SELECT clause early - always create __select_results
  // This eliminates duplication and allows for DISTINCT implementation
  if (query.fnSelect) {
    // Handle functional select - apply the function to transform the row
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = query.fnSelect!(namespacedRow)
        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults,
          },
        ] as [string, typeof namespacedRow & { __select_results: any }]
      }),
    )
  } else if (query.select) {
    pipeline = processSelect(pipeline, query.select, allInputs)
  } else {
    // If no SELECT clause, create __select_results with the main table data
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults =
          !query.join && !query.groupBy
            ? namespacedRow[mainSource]
            : namespacedRow

        return [
          key,
          {
            ...namespacedRow,
            __select_results: selectResults,
          },
        ] as [string, typeof namespacedRow & { __select_results: any }]
      }),
    )
  }

  // Process the GROUP BY clause if it exists
  if (query.groupBy && query.groupBy.length > 0) {
    pipeline = processGroupBy(
      pipeline,
      query.groupBy,
      query.having,
      query.select,
      query.fnHaving,
    )
  } else if (query.select) {
    // Check if SELECT contains aggregates but no GROUP BY (implicit single-group aggregation)
    const hasAggregates = Object.values(query.select).some(
      (expr) => expr.type === `agg`,
    )
    if (hasAggregates) {
      // Handle implicit single-group aggregation
      pipeline = processGroupBy(
        pipeline,
        [], // Empty group by means single group
        query.having,
        query.select,
        query.fnHaving,
      )
    }
  }

  // Process the HAVING clause if it exists (only applies after GROUP BY)
  if (query.having && (!query.groupBy || query.groupBy.length === 0)) {
    // Check if we have aggregates in SELECT that would trigger implicit grouping
    const hasAggregates = query.select
      ? Object.values(query.select).some((expr) => expr.type === `agg`)
      : false

    if (!hasAggregates) {
      throw new HavingRequiresGroupByError()
    }
  }

  // Process functional HAVING clauses outside of GROUP BY (treat as additional WHERE filters)
  if (
    query.fnHaving &&
    query.fnHaving.length > 0 &&
    (!query.groupBy || query.groupBy.length === 0)
  ) {
    // If there's no GROUP BY but there are fnHaving clauses, apply them as filters
    for (const fnHaving of query.fnHaving) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return fnHaving(namespacedRow)
        }),
      )
    }
  }

  // Process the DISTINCT clause if it exists
  if (query.distinct) {
    pipeline = pipeline.pipe(distinct(([_key, row]) => row.__select_results))
  }

  // Process orderBy parameter if it exists
  if (query.orderBy && query.orderBy.length > 0) {
    const orderedPipeline = processOrderBy(
      rawQuery,
      pipeline,
      query.orderBy,
      query.select || {},
      collections[mainCollectionId]!,
      optimizableOrderByCollections,
      setWindowFn,
      query.limit,
      query.offset,
    )

    // Final step: extract the __select_results and include orderBy index
    const resultPipeline = orderedPipeline.pipe(
      map(([key, [row, orderByIndex]]) => {
        // Extract the final results from __select_results and include orderBy index
        const raw = (row as any).__select_results
        const finalResults = unwrapValue(raw)
        return [key, [finalResults, orderByIndex]] as [unknown, [any, string]]
      }),
    )

    const result = resultPipeline
    // Cache the result before returning (use original query as key)
    const compilationResult = {
      collectionId: mainCollectionId,
      pipeline: result,
      sourceWhereClauses,
      aliasToCollectionId,
      aliasRemapping,
    }
    cache.set(rawQuery, compilationResult)

    return compilationResult
  } else if (query.limit !== undefined || query.offset !== undefined) {
    // If there's a limit or offset without orderBy, throw an error
    throw new LimitOffsetRequireOrderByError()
  }

  // Final step: extract the __select_results and return tuple format (no orderBy)
  const resultPipeline: ResultStream = pipeline.pipe(
    map(([key, row]) => {
      // Extract the final results from __select_results and return [key, [results, undefined]]
      const raw = (row as any).__select_results
      const finalResults = unwrapValue(raw)
      return [key, [finalResults, undefined]] as [
        unknown,
        [any, string | undefined],
      ]
    }),
  )

  const result = resultPipeline
  // Cache the result before returning (use original query as key)
  const compilationResult = {
    collectionId: mainCollectionId,
    pipeline: result,
    sourceWhereClauses,
    aliasToCollectionId,
    aliasRemapping,
  }
  cache.set(rawQuery, compilationResult)

  return compilationResult
}

/**
 * Collects aliases used for DIRECT collection references (not subqueries).
 * Used to validate that subqueries don't reuse parent query collection aliases.
 * Only direct CollectionRef aliases matter - QueryRef aliases don't cause conflicts.
 */
function collectDirectCollectionAliases(query: QueryIR): Set<string> {
  const aliases = new Set<string>()

  // Collect FROM alias only if it's a direct collection reference
  if (query.from.type === `collectionRef`) {
    aliases.add(query.from.alias)
  }

  // Collect JOIN aliases only for direct collection references
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `collectionRef`) {
        aliases.add(joinClause.from.alias)
      }
    }
  }

  return aliases
}

/**
 * Validates the structure of a query and its subqueries.
 * Checks that subqueries don't reuse collection aliases from parent queries.
 * This must be called on the RAW query before optimization.
 */
function validateQueryStructure(
  query: QueryIR,
  parentCollectionAliases: Set<string> = new Set(),
): void {
  // Collect direct collection aliases from this query level
  const currentLevelAliases = collectDirectCollectionAliases(query)

  // Check if any current alias conflicts with parent aliases
  for (const alias of currentLevelAliases) {
    if (parentCollectionAliases.has(alias)) {
      throw new DuplicateAliasInSubqueryError(
        alias,
        Array.from(parentCollectionAliases),
      )
    }
  }

  // Combine parent and current aliases for checking nested subqueries
  const combinedAliases = new Set([
    ...parentCollectionAliases,
    ...currentLevelAliases,
  ])

  // Recursively validate FROM subquery
  if (query.from.type === `queryRef`) {
    validateQueryStructure(query.from.query, combinedAliases)
  }

  // Recursively validate JOIN subqueries
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `queryRef`) {
        validateQueryStructure(joinClause.from.query, combinedAliases)
      }
    }
  }
}

/**
 * Processes the FROM clause, handling direct collection references and subqueries.
 * Populates `aliasToCollectionId` and `aliasRemapping` for per-alias subscription tracking.
 */
function processFrom(
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
      const subQueryResult = compileQuery(
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

      // Create a FLATTENED remapping from outer alias to innermost alias.
      // For nested subqueries, this ensures one-hop lookups (not recursive chains).
      //
      // Example with 3-level nesting:
      //   Inner:  .from({ user: usersCollection })
      //   Middle: .from({ activeUser: innerSubquery })     → creates: activeUser → user
      //   Outer:  .from({ author: middleSubquery })        → creates: author → user (not author → activeUser)
      //
      // The key insight: We search through the PULLED-UP aliasToCollectionId (which contains
      // the innermost 'user' alias), so we always map directly to the deepest level.
      // This means aliasRemapping[alias] is always a single lookup, never recursive.
      // Needed for subscription resolution during lazy loading.
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
          // Unwrap Value expressions that might have leaked through as the entire row
          const unwrapped = unwrapValue(value)
          return [key, unwrapped] as [unknown, any]
        }),
      )

      return {
        alias: from.alias,
        input: extractedInput,
        collectionId: subQueryResult.collectionId,
      }
    }
    default:
      throw new UnsupportedFromTypeError((from as any).type)
  }
}

// Helper to check if a value is a Value expression
function isValue(raw: any): boolean {
  return (
    raw instanceof ValClass ||
    (raw && typeof raw === `object` && `type` in raw && raw.type === `val`)
  )
}

// Helper to unwrap a Value expression or return the value itself
function unwrapValue(value: any): any {
  return isValue(value) ? value.value : value
}

/**
 * Recursively maps optimized subqueries to their original queries for proper caching.
 * This ensures that when we encounter the same QueryRef object in different contexts,
 * we can find the original query to check the cache.
 */
function mapNestedQueries(
  optimizedQuery: QueryIR,
  originalQuery: QueryIR,
  queryMapping: QueryMapping,
): void {
  // Map the FROM clause if it's a QueryRef
  if (
    optimizedQuery.from.type === `queryRef` &&
    originalQuery.from.type === `queryRef`
  ) {
    queryMapping.set(optimizedQuery.from.query, originalQuery.from.query)
    // Recursively map nested queries
    mapNestedQueries(
      optimizedQuery.from.query,
      originalQuery.from.query,
      queryMapping,
    )
  }

  // Map JOIN clauses if they exist
  if (optimizedQuery.join && originalQuery.join) {
    for (
      let i = 0;
      i < optimizedQuery.join.length && i < originalQuery.join.length;
      i++
    ) {
      const optimizedJoin = optimizedQuery.join[i]!
      const originalJoin = originalQuery.join[i]!

      if (
        optimizedJoin.from.type === `queryRef` &&
        originalJoin.from.type === `queryRef`
      ) {
        queryMapping.set(optimizedJoin.from.query, originalJoin.from.query)
        // Recursively map nested queries in joins
        mapNestedQueries(
          optimizedJoin.from.query,
          originalJoin.from.query,
          queryMapping,
        )
      }
    }
  }
}

function getRefFromAlias(
  query: QueryIR,
  alias: string,
): CollectionRef | QueryRef | void {
  if (query.from.alias === alias) {
    return query.from
  }

  for (const join of query.join || []) {
    if (join.from.alias === alias) {
      return join.from
    }
  }
}

/**
 * Follows the given reference in a query
 * until its finds the root field the reference points to.
 * @returns The collection, its alias, and the path to the root field in this collection
 */
export function followRef(
  query: QueryIR,
  ref: PropRef<any>,
  collection: Collection,
): { collection: Collection; path: Array<string> } | void {
  if (ref.path.length === 0) {
    return
  }

  if (ref.path.length === 1) {
    // This field should be part of this collection
    const field = ref.path[0]!
    // is it part of the select clause?
    if (query.select) {
      const selectedField = query.select[field]
      if (selectedField && selectedField.type === `ref`) {
        return followRef(query, selectedField, collection)
      }
    }

    // Either this field is not part of the select clause
    // and thus it must be part of the collection itself
    // or it is part of the select but is not a reference
    // so we can stop here and don't have to follow it
    return { collection, path: [field] }
  }

  if (ref.path.length > 1) {
    // This is a nested field
    const [alias, ...rest] = ref.path
    const aliasRef = getRefFromAlias(query, alias!)
    if (!aliasRef) {
      return
    }

    if (aliasRef.type === `queryRef`) {
      return followRef(aliasRef.query, new PropRef(rest), collection)
    } else {
      // This is a reference to a collection
      // we can't follow it further
      // so the field must be on the collection itself
      return { collection: aliasRef.collection, path: rest }
    }
  }
}

export type CompileQueryFn = typeof compileQuery
