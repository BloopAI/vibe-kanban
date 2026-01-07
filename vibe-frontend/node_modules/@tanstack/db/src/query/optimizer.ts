/**
 * # Query Optimizer
 *
 * The query optimizer improves query performance by implementing predicate pushdown optimization.
 * It rewrites the intermediate representation (IR) to push WHERE clauses as close to the data
 * source as possible, reducing the amount of data processed during joins.
 *
 * ## How It Works
 *
 * The optimizer follows a 4-step process:
 *
 * ### 1. AND Clause Splitting
 * Splits AND clauses at the root level into separate WHERE clauses for granular optimization.
 * ```javascript
 * // Before: WHERE and(eq(users.department_id, 1), gt(users.age, 25))
 * // After:  WHERE eq(users.department_id, 1) + WHERE gt(users.age, 25)
 * ```
 *
 * ### 2. Source Analysis
 * Analyzes each WHERE clause to determine which table sources it references:
 * - Single-source clauses: Touch only one table (e.g., `users.department_id = 1`)
 * - Multi-source clauses: Touch multiple tables (e.g., `users.id = posts.user_id`)
 *
 * ### 3. Clause Grouping
 * Groups WHERE clauses by the sources they touch:
 * - Single-source clauses are grouped by their respective table
 * - Multi-source clauses are combined for the main query
 *
 * ### 4. Subquery Creation
 * Lifts single-source WHERE clauses into subqueries that wrap the original table references.
 *
 * ## Safety & Edge Cases
 *
 * The optimizer includes targeted safety checks to prevent predicate pushdown when it could
 * break query semantics:
 *
 * ### Always Safe Operations
 * - **Creating new subqueries**: Wrapping collection references in subqueries with WHERE clauses
 * - **Main query optimizations**: Moving single-source WHERE clauses from main query to subqueries
 * - **Queries with aggregates/ORDER BY/HAVING**: Can still create new filtered subqueries
 *
 * ### Unsafe Operations (blocked by safety checks)
 * Pushing WHERE clauses **into existing subqueries** that have:
 * - **Aggregates**: GROUP BY, HAVING, or aggregate functions in SELECT (would change aggregation)
 * - **Ordering + Limits**: ORDER BY combined with LIMIT/OFFSET (would change result set)
 * - **Functional Operations**: fnSelect, fnWhere, fnHaving (potential side effects)
 *
 * ### Residual WHERE Clauses
 * For outer joins (LEFT, RIGHT, FULL), WHERE clauses are copied to subqueries for optimization
 * but also kept as "residual" clauses in the main query to preserve semantics. This ensures
 * that NULL values from outer joins are properly filtered according to SQL standards.
 *
 * The optimizer tracks which clauses were actually optimized and only removes those from the
 * main query. Subquery reuse is handled safely through immutable query copies.
 *
 * ## Example Optimizations
 *
 * ### Basic Query with Joins
 * **Original Query:**
 * ```javascript
 * query
 *   .from({ users: usersCollection })
 *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.user_id))
 *   .where(({users}) => eq(users.department_id, 1))
 *   .where(({posts}) => gt(posts.views, 100))
 *   .where(({users, posts}) => eq(users.id, posts.author_id))
 * ```
 *
 * **Optimized Query:**
 * ```javascript
 * query
 *   .from({
 *     users: subquery
 *       .from({ users: usersCollection })
 *       .where(({users}) => eq(users.department_id, 1))
 *   })
 *   .join({
 *     posts: subquery
 *       .from({ posts: postsCollection })
 *       .where(({posts}) => gt(posts.views, 100))
 *   }, ({users, posts}) => eq(users.id, posts.user_id))
 *   .where(({users, posts}) => eq(users.id, posts.author_id))
 * ```
 *
 * ### Query with Aggregates (Now Optimizable!)
 * **Original Query:**
 * ```javascript
 * query
 *   .from({ users: usersCollection })
 *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.user_id))
 *   .where(({users}) => eq(users.department_id, 1))
 *   .groupBy(['users.department_id'])
 *   .select({ count: agg('count', '*') })
 * ```
 *
 * **Optimized Query:**
 * ```javascript
 * query
 *   .from({
 *     users: subquery
 *       .from({ users: usersCollection })
 *       .where(({users}) => eq(users.department_id, 1))
 *   })
 *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.user_id))
 *   .groupBy(['users.department_id'])
 *   .select({ count: agg('count', '*') })
 * ```
 *
 * ## Benefits
 *
 * - **Reduced Data Processing**: Filters applied before joins reduce intermediate result size
 * - **Better Performance**: Smaller datasets lead to faster query execution
 * - **Automatic Optimization**: No manual query rewriting required
 * - **Preserves Semantics**: Optimized queries return identical results
 * - **Safe by Design**: Comprehensive checks prevent semantic-breaking optimizations
 *
 * ## Integration
 *
 * The optimizer is automatically called during query compilation before the IR is
 * transformed into a D2Mini pipeline.
 */

import { deepEquals } from '../utils.js'
import { CannotCombineEmptyExpressionListError } from '../errors.js'
import {
  CollectionRef as CollectionRefClass,
  Func,
  PropRef,
  QueryRef as QueryRefClass,
  createResidualWhere,
  getWhereExpression,
  isResidualWhere,
} from './ir.js'
import type { BasicExpression, From, QueryIR, Select, Where } from './ir.js'

/**
 * Represents a WHERE clause after source analysis
 */
export interface AnalyzedWhereClause {
  /** The WHERE expression */
  expression: BasicExpression<boolean>
  /** Set of table/source aliases that this WHERE clause touches */
  touchedSources: Set<string>
  /** Whether this clause contains namespace-only references that prevent pushdown */
  hasNamespaceOnlyRef: boolean
}

/**
 * Represents WHERE clauses grouped by the sources they touch
 */
export interface GroupedWhereClauses {
  /** WHERE clauses that touch only a single source, grouped by source alias */
  singleSource: Map<string, BasicExpression<boolean>>
  /** WHERE clauses that touch multiple sources, combined into one expression */
  multiSource?: BasicExpression<boolean>
}

/**
 * Result of query optimization including both the optimized query and collection-specific WHERE clauses
 */
export interface OptimizationResult {
  /** The optimized query with WHERE clauses potentially moved to subqueries */
  optimizedQuery: QueryIR
  /** Map of source aliases to their extracted WHERE clauses for index optimization */
  sourceWhereClauses: Map<string, BasicExpression<boolean>>
}

/**
 * Main query optimizer entry point that lifts WHERE clauses into subqueries.
 *
 * This function implements multi-level predicate pushdown optimization by recursively
 * moving WHERE clauses through nested subqueries to get them as close to the data
 * sources as possible, then removing redundant subqueries.
 *
 * @param query - The QueryIR to optimize
 * @returns An OptimizationResult with the optimized query and collection WHERE clause mapping
 *
 * @example
 * ```typescript
 * const originalQuery = {
 *   from: new CollectionRef(users, 'u'),
 *   join: [{ from: new CollectionRef(posts, 'p'), ... }],
 *   where: [eq(u.dept_id, 1), gt(p.views, 100)]
 * }
 *
 * const { optimizedQuery, sourceWhereClauses } = optimizeQuery(originalQuery)
 * // Result: Single-source clauses moved to deepest possible subqueries
 * // sourceWhereClauses: Map { 'u' => eq(u.dept_id, 1), 'p' => gt(p.views, 100) }
 * ```
 */
export function optimizeQuery(query: QueryIR): OptimizationResult {
  // First, extract source WHERE clauses before optimization
  const sourceWhereClauses = extractSourceWhereClauses(query)

  // Apply multi-level predicate pushdown with iterative convergence
  let optimized = query
  let previousOptimized: QueryIR | undefined
  let iterations = 0
  const maxIterations = 10 // Prevent infinite loops

  // Keep optimizing until no more changes occur or max iterations reached
  while (
    iterations < maxIterations &&
    !deepEquals(optimized, previousOptimized)
  ) {
    previousOptimized = optimized
    optimized = applyRecursiveOptimization(optimized)
    iterations++
  }

  // Remove redundant subqueries
  const cleaned = removeRedundantSubqueries(optimized)

  return {
    optimizedQuery: cleaned,
    sourceWhereClauses,
  }
}

/**
 * Extracts collection-specific WHERE clauses from a query for index optimization.
 * This analyzes the original query to identify WHERE clauses that can be pushed down
 * to specific collections, but only for simple queries without joins.
 *
 * @param query - The original QueryIR to analyze
 * @returns Map of source aliases to their WHERE clauses
 */
function extractSourceWhereClauses(
  query: QueryIR,
): Map<string, BasicExpression<boolean>> {
  const sourceWhereClauses = new Map<string, BasicExpression<boolean>>()

  // Only analyze queries that have WHERE clauses
  if (!query.where || query.where.length === 0) {
    return sourceWhereClauses
  }

  // Split all AND clauses at the root level for granular analysis
  const splitWhereClauses = splitAndClauses(query.where)

  // Analyze each WHERE clause to determine which sources it touches
  const analyzedClauses = splitWhereClauses.map((clause) =>
    analyzeWhereClause(clause),
  )

  // Group clauses by single-source vs multi-source
  const groupedClauses = groupWhereClauses(analyzedClauses)

  // Only include single-source clauses that reference collections directly
  for (const [sourceAlias, whereClause] of groupedClauses.singleSource) {
    // Check if this source alias corresponds to a collection reference
    if (isCollectionReference(query, sourceAlias)) {
      sourceWhereClauses.set(sourceAlias, whereClause)
    }
  }

  return sourceWhereClauses
}

/**
 * Determines if a source alias refers to a collection reference (not a subquery).
 * This is used to identify WHERE clauses that can be pushed down to collection subscriptions.
 *
 * @param query - The query to analyze
 * @param sourceAlias - The source alias to check
 * @returns True if the alias refers to a collection reference
 */
function isCollectionReference(query: QueryIR, sourceAlias: string): boolean {
  // Check the FROM clause
  if (query.from.alias === sourceAlias) {
    return query.from.type === `collectionRef`
  }

  // Check JOIN clauses
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.alias === sourceAlias) {
        return joinClause.from.type === `collectionRef`
      }
    }
  }

  return false
}

/**
 * Applies recursive predicate pushdown optimization.
 *
 * @param query - The QueryIR to optimize
 * @returns A new QueryIR with optimizations applied
 */
function applyRecursiveOptimization(query: QueryIR): QueryIR {
  // First, recursively optimize any existing subqueries
  const subqueriesOptimized = {
    ...query,
    from:
      query.from.type === `queryRef`
        ? new QueryRefClass(
            applyRecursiveOptimization(query.from.query),
            query.from.alias,
          )
        : query.from,
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from:
        joinClause.from.type === `queryRef`
          ? new QueryRefClass(
              applyRecursiveOptimization(joinClause.from.query),
              joinClause.from.alias,
            )
          : joinClause.from,
    })),
  }

  // Then apply single-level optimization to this query
  return applySingleLevelOptimization(subqueriesOptimized)
}

/**
 * Applies single-level predicate pushdown optimization (existing logic)
 */
function applySingleLevelOptimization(query: QueryIR): QueryIR {
  // Skip optimization if no WHERE clauses exist
  if (!query.where || query.where.length === 0) {
    return query
  }

  // For queries without joins, combine multiple WHERE clauses into a single clause
  // to avoid creating multiple filter operators in the pipeline
  if (!query.join || query.join.length === 0) {
    // Only optimize if there are multiple WHERE clauses to combine
    if (query.where.length > 1) {
      // Combine multiple WHERE clauses into a single AND expression
      const splitWhereClauses = splitAndClauses(query.where)
      const combinedWhere = combineWithAnd(splitWhereClauses)

      return {
        ...query,
        where: [combinedWhere],
      }
    }

    // For single WHERE clauses, no optimization needed
    return query
  }

  // Filter out residual WHERE clauses to prevent them from being optimized again
  const nonResidualWhereClauses = query.where.filter(
    (where) => !isResidualWhere(where),
  )

  // Step 1: Split all AND clauses at the root level for granular optimization
  const splitWhereClauses = splitAndClauses(nonResidualWhereClauses)

  // Step 2: Analyze each WHERE clause to determine which sources it touches
  const analyzedClauses = splitWhereClauses.map((clause) =>
    analyzeWhereClause(clause),
  )

  // Step 3: Group clauses by single-source vs multi-source
  const groupedClauses = groupWhereClauses(analyzedClauses)

  // Step 4: Apply optimizations by lifting single-source clauses into subqueries
  const optimizedQuery = applyOptimizations(query, groupedClauses)

  // Add back any residual WHERE clauses that were filtered out
  const residualWhereClauses = query.where.filter((where) =>
    isResidualWhere(where),
  )
  if (residualWhereClauses.length > 0) {
    optimizedQuery.where = [
      ...(optimizedQuery.where || []),
      ...residualWhereClauses,
    ]
  }

  return optimizedQuery
}

/**
 * Removes redundant subqueries that don't add value.
 * A subquery is redundant if it only wraps another query without adding
 * WHERE, SELECT, GROUP BY, HAVING, ORDER BY, or LIMIT/OFFSET clauses.
 *
 * @param query - The QueryIR to process
 * @returns A new QueryIR with redundant subqueries removed
 */
function removeRedundantSubqueries(query: QueryIR): QueryIR {
  return {
    ...query,
    from: removeRedundantFromClause(query.from),
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from: removeRedundantFromClause(joinClause.from),
    })),
  }
}

/**
 * Removes redundant subqueries from a FROM clause.
 *
 * @param from - The FROM clause to process
 * @returns A FROM clause with redundant subqueries removed
 */
function removeRedundantFromClause(from: From): From {
  if (from.type === `collectionRef`) {
    return from
  }

  const processedQuery = removeRedundantSubqueries(from.query)

  // Check if this subquery is redundant
  if (isRedundantSubquery(processedQuery)) {
    // Return the inner query's FROM clause with this alias
    const innerFrom = removeRedundantFromClause(processedQuery.from)
    if (innerFrom.type === `collectionRef`) {
      return new CollectionRefClass(innerFrom.collection, from.alias)
    } else {
      return new QueryRefClass(innerFrom.query, from.alias)
    }
  }

  return new QueryRefClass(processedQuery, from.alias)
}

/**
 * Determines if a subquery is redundant (adds no value).
 *
 * @param query - The query to check
 * @returns True if the query is redundant and can be removed
 */
function isRedundantSubquery(query: QueryIR): boolean {
  return (
    (!query.where || query.where.length === 0) &&
    !query.select &&
    (!query.groupBy || query.groupBy.length === 0) &&
    (!query.having || query.having.length === 0) &&
    (!query.orderBy || query.orderBy.length === 0) &&
    (!query.join || query.join.length === 0) &&
    query.limit === undefined &&
    query.offset === undefined &&
    !query.fnSelect &&
    (!query.fnWhere || query.fnWhere.length === 0) &&
    (!query.fnHaving || query.fnHaving.length === 0)
  )
}

/**
 * Step 1: Split all AND clauses recursively into separate WHERE clauses.
 *
 * This enables more granular optimization by treating each condition independently.
 * OR clauses are preserved as they cannot be split without changing query semantics.
 *
 * @param whereClauses - Array of WHERE expressions to split
 * @returns Flattened array with AND clauses split into separate expressions
 *
 * @example
 * ```typescript
 * // Input: [and(eq(a, 1), gt(b, 2)), eq(c, 3)]
 * // Output: [eq(a, 1), gt(b, 2), eq(c, 3)]
 * ```
 */
function splitAndClauses(
  whereClauses: Array<Where>,
): Array<BasicExpression<boolean>> {
  const result: Array<BasicExpression<boolean>> = []

  for (const whereClause of whereClauses) {
    const clause = getWhereExpression(whereClause)
    result.push(...splitAndClausesRecursive(clause))
  }

  return result
}

// Helper function for recursive splitting of BasicExpression arrays
function splitAndClausesRecursive(
  clause: BasicExpression<boolean>,
): Array<BasicExpression<boolean>> {
  if (clause.type === `func` && clause.name === `and`) {
    // Recursively split nested AND clauses to handle complex expressions
    const result: Array<BasicExpression<boolean>> = []
    for (const arg of clause.args as Array<BasicExpression<boolean>>) {
      result.push(...splitAndClausesRecursive(arg))
    }
    return result
  } else {
    // Preserve non-AND clauses as-is (including OR clauses)
    return [clause]
  }
}

/**
 * Step 2: Analyze which table sources a WHERE clause touches.
 *
 * This determines whether a clause can be pushed down to a specific table
 * or must remain in the main query (for multi-source clauses like join conditions).
 *
 * Special handling for namespace-only references in outer joins:
 * WHERE clauses that reference only a table namespace (e.g., isUndefined(special), eq(special, value))
 * rather than specific properties (e.g., isUndefined(special.id), eq(special.id, value)) are treated as
 * multi-source to prevent incorrect predicate pushdown that would change join semantics.
 *
 * @param clause - The WHERE expression to analyze
 * @returns Analysis result with the expression and touched source aliases
 *
 * @example
 * ```typescript
 * // eq(users.department_id, 1) -> touches ['users'], hasNamespaceOnlyRef: false
 * // eq(users.id, posts.user_id) -> touches ['users', 'posts'], hasNamespaceOnlyRef: false
 * // isUndefined(special) -> touches ['special'], hasNamespaceOnlyRef: true (prevents pushdown)
 * // eq(special, someValue) -> touches ['special'], hasNamespaceOnlyRef: true (prevents pushdown)
 * // isUndefined(special.id) -> touches ['special'], hasNamespaceOnlyRef: false (allows pushdown)
 * // eq(special.id, 5) -> touches ['special'], hasNamespaceOnlyRef: false (allows pushdown)
 * ```
 */
function analyzeWhereClause(
  clause: BasicExpression<boolean>,
): AnalyzedWhereClause {
  // Track which table aliases this WHERE clause touches
  const touchedSources = new Set<string>()
  // Track whether this clause contains namespace-only references that prevent pushdown
  let hasNamespaceOnlyRef = false

  /**
   * Recursively collect all table aliases referenced in an expression
   */
  function collectSources(expr: BasicExpression | any): void {
    switch (expr.type) {
      case `ref`:
        // PropRef path has the table alias as the first element
        if (expr.path && expr.path.length > 0) {
          const firstElement = expr.path[0]
          if (firstElement) {
            touchedSources.add(firstElement)

            // If the path has only one element (just the namespace),
            // this is a namespace-only reference that should not be pushed down
            // This applies to ANY function, not just existence-checking functions
            if (expr.path.length === 1) {
              hasNamespaceOnlyRef = true
            }
          }
        }
        break
      case `func`:
        // Recursively analyze function arguments (e.g., eq, gt, and, or)
        if (expr.args) {
          expr.args.forEach(collectSources)
        }
        break
      case `val`:
        // Values don't reference any sources
        break
      case `agg`:
        // Aggregates can reference sources in their arguments
        if (expr.args) {
          expr.args.forEach(collectSources)
        }
        break
    }
  }

  collectSources(clause)

  return {
    expression: clause,
    touchedSources,
    hasNamespaceOnlyRef,
  }
}

/**
 * Step 3: Group WHERE clauses by the sources they touch.
 *
 * Single-source clauses can be pushed down to subqueries for optimization.
 * Multi-source clauses must remain in the main query to preserve join semantics.
 *
 * @param analyzedClauses - Array of analyzed WHERE clauses
 * @returns Grouped clauses ready for optimization
 */
function groupWhereClauses(
  analyzedClauses: Array<AnalyzedWhereClause>,
): GroupedWhereClauses {
  const singleSource = new Map<string, Array<BasicExpression<boolean>>>()
  const multiSource: Array<BasicExpression<boolean>> = []

  // Categorize each clause based on how many sources it touches
  for (const clause of analyzedClauses) {
    if (clause.touchedSources.size === 1 && !clause.hasNamespaceOnlyRef) {
      // Single source clause without namespace-only references - can be optimized
      const source = Array.from(clause.touchedSources)[0]!
      if (!singleSource.has(source)) {
        singleSource.set(source, [])
      }
      singleSource.get(source)!.push(clause.expression)
    } else if (clause.touchedSources.size > 1 || clause.hasNamespaceOnlyRef) {
      // Multi-source clause or namespace-only reference - must stay in main query
      multiSource.push(clause.expression)
    }
    // Skip clauses that touch no sources (constants) - they don't need optimization
  }

  // Combine multiple clauses for each source with AND
  const combinedSingleSource = new Map<string, BasicExpression<boolean>>()
  for (const [source, clauses] of singleSource) {
    combinedSingleSource.set(source, combineWithAnd(clauses))
  }

  // Combine multi-source clauses with AND
  const combinedMultiSource =
    multiSource.length > 0 ? combineWithAnd(multiSource) : undefined

  return {
    singleSource: combinedSingleSource,
    multiSource: combinedMultiSource,
  }
}

/**
 * Step 4: Apply optimizations by lifting single-source clauses into subqueries.
 *
 * Creates a new QueryIR with single-source WHERE clauses moved to subqueries
 * that wrap the original table references. This ensures immutability and prevents
 * infinite recursion issues.
 *
 * @param query - Original QueryIR to optimize
 * @param groupedClauses - WHERE clauses grouped by optimization strategy
 * @returns New QueryIR with optimizations applied
 */
function applyOptimizations(
  query: QueryIR,
  groupedClauses: GroupedWhereClauses,
): QueryIR {
  // Track which single-source clauses were actually optimized
  const actuallyOptimized = new Set<string>()

  // Optimize the main FROM clause and track what was optimized
  const optimizedFrom = optimizeFromWithTracking(
    query.from,
    groupedClauses.singleSource,
    actuallyOptimized,
  )

  // Optimize JOIN clauses and track what was optimized
  const optimizedJoins = query.join
    ? query.join.map((joinClause) => ({
        ...joinClause,
        from: optimizeFromWithTracking(
          joinClause.from,
          groupedClauses.singleSource,
          actuallyOptimized,
        ),
      }))
    : undefined

  // Build the remaining WHERE clauses: multi-source + residual single-source clauses
  const remainingWhereClauses: Array<Where> = []

  // Add multi-source clauses
  if (groupedClauses.multiSource) {
    remainingWhereClauses.push(groupedClauses.multiSource)
  }

  // Determine if we need residual clauses (when query has outer JOINs)
  const hasOuterJoins =
    query.join &&
    query.join.some(
      (join) =>
        join.type === `left` || join.type === `right` || join.type === `full`,
    )

  // Add single-source clauses
  for (const [source, clause] of groupedClauses.singleSource) {
    if (!actuallyOptimized.has(source)) {
      // Wasn't optimized at all - keep as regular WHERE clause
      remainingWhereClauses.push(clause)
    } else if (hasOuterJoins) {
      // Was optimized AND query has outer JOINs - keep as residual WHERE clause
      remainingWhereClauses.push(createResidualWhere(clause))
    }
    // If optimized and no outer JOINs - don't keep (original behavior)
  }

  // Combine multiple remaining WHERE clauses into a single clause to avoid
  // multiple filter operations in the pipeline (performance optimization)
  // First flatten any nested AND expressions to avoid and(and(...), ...)
  const finalWhere: Array<Where> =
    remainingWhereClauses.length > 1
      ? [
          combineWithAnd(
            remainingWhereClauses.flatMap((clause) =>
              splitAndClausesRecursive(getWhereExpression(clause)),
            ),
          ),
        ]
      : remainingWhereClauses

  // Create a completely new query object to ensure immutability
  const optimizedQuery: QueryIR = {
    // Copy all non-optimized fields as-is
    select: query.select,
    groupBy: query.groupBy ? [...query.groupBy] : undefined,
    having: query.having ? [...query.having] : undefined,
    orderBy: query.orderBy ? [...query.orderBy] : undefined,
    limit: query.limit,
    offset: query.offset,
    distinct: query.distinct,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : undefined,
    fnHaving: query.fnHaving ? [...query.fnHaving] : undefined,

    // Use the optimized FROM and JOIN clauses
    from: optimizedFrom,
    join: optimizedJoins,

    // Include combined WHERE clauses
    where: finalWhere.length > 0 ? finalWhere : [],
  }

  return optimizedQuery
}

/**
 * Helper function to create a deep copy of a QueryIR object for immutability.
 *
 * This ensures that all optimizations create new objects rather than modifying
 * existing ones, preventing infinite recursion and shared reference issues.
 *
 * @param query - QueryIR to deep copy
 * @returns New QueryIR object with all nested objects copied
 */
function deepCopyQuery(query: QueryIR): QueryIR {
  return {
    // Recursively copy the FROM clause
    from:
      query.from.type === `collectionRef`
        ? new CollectionRefClass(query.from.collection, query.from.alias)
        : new QueryRefClass(deepCopyQuery(query.from.query), query.from.alias),

    // Copy all other fields, creating new arrays where necessary
    select: query.select,
    join: query.join
      ? query.join.map((joinClause) => ({
          type: joinClause.type,
          left: joinClause.left,
          right: joinClause.right,
          from:
            joinClause.from.type === `collectionRef`
              ? new CollectionRefClass(
                  joinClause.from.collection,
                  joinClause.from.alias,
                )
              : new QueryRefClass(
                  deepCopyQuery(joinClause.from.query),
                  joinClause.from.alias,
                ),
        }))
      : undefined,
    where: query.where ? [...query.where] : undefined,
    groupBy: query.groupBy ? [...query.groupBy] : undefined,
    having: query.having ? [...query.having] : undefined,
    orderBy: query.orderBy ? [...query.orderBy] : undefined,
    limit: query.limit,
    offset: query.offset,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : undefined,
    fnHaving: query.fnHaving ? [...query.fnHaving] : undefined,
  }
}

/**
 * Helper function to optimize a FROM clause while tracking what was actually optimized.
 *
 * @param from - FROM clause to optimize
 * @param singleSourceClauses - Map of source aliases to their WHERE clauses
 * @param actuallyOptimized - Set to track which sources were actually optimized
 * @returns New FROM clause, potentially wrapped in a subquery
 */
function optimizeFromWithTracking(
  from: From,
  singleSourceClauses: Map<string, BasicExpression<boolean>>,
  actuallyOptimized: Set<string>,
): From {
  const whereClause = singleSourceClauses.get(from.alias)

  if (!whereClause) {
    // No optimization needed, but return a copy to maintain immutability
    if (from.type === `collectionRef`) {
      return new CollectionRefClass(from.collection, from.alias)
    }
    // Must be queryRef due to type system
    return new QueryRefClass(deepCopyQuery(from.query), from.alias)
  }

  if (from.type === `collectionRef`) {
    // Create a new subquery with the WHERE clause for the collection
    // This is always safe since we're creating a new subquery
    const subQuery: QueryIR = {
      from: new CollectionRefClass(from.collection, from.alias),
      where: [whereClause],
    }
    actuallyOptimized.add(from.alias) // Mark as successfully optimized
    return new QueryRefClass(subQuery, from.alias)
  }

  // SAFETY CHECK: Only check safety when pushing WHERE clauses into existing subqueries
  // We need to be careful about pushing WHERE clauses into subqueries that already have
  // aggregates, HAVING, or ORDER BY + LIMIT since that could change their semantics
  if (!isSafeToPushIntoExistingSubquery(from.query, whereClause, from.alias)) {
    // Return a copy without optimization to maintain immutability
    // Do NOT mark as optimized since we didn't actually optimize it
    return new QueryRefClass(deepCopyQuery(from.query), from.alias)
  }

  // Skip pushdown when a clause references a field that only exists via a renamed
  // projection inside the subquery; leaving it outside preserves the alias mapping.
  if (referencesAliasWithRemappedSelect(from.query, whereClause, from.alias)) {
    return new QueryRefClass(deepCopyQuery(from.query), from.alias)
  }

  // Add the WHERE clause to the existing subquery
  // Create a deep copy to ensure immutability
  const existingWhere = from.query.where || []
  const optimizedSubQuery: QueryIR = {
    ...deepCopyQuery(from.query),
    where: [...existingWhere, whereClause],
  }
  actuallyOptimized.add(from.alias) // Mark as successfully optimized
  return new QueryRefClass(optimizedSubQuery, from.alias)
}

function unsafeSelect(
  query: QueryIR,
  whereClause: BasicExpression<boolean>,
  outerAlias: string,
): boolean {
  if (!query.select) return false

  return (
    selectHasAggregates(query.select) ||
    whereReferencesComputedSelectFields(query.select, whereClause, outerAlias)
  )
}

function unsafeGroupBy(query: QueryIR) {
  return query.groupBy && query.groupBy.length > 0
}

function unsafeHaving(query: QueryIR) {
  return query.having && query.having.length > 0
}

function unsafeOrderBy(query: QueryIR) {
  return (
    query.orderBy &&
    query.orderBy.length > 0 &&
    (query.limit !== undefined || query.offset !== undefined)
  )
}

function unsafeFnSelect(query: QueryIR) {
  return (
    query.fnSelect ||
    (query.fnWhere && query.fnWhere.length > 0) ||
    (query.fnHaving && query.fnHaving.length > 0)
  )
}

function isSafeToPushIntoExistingSubquery(
  query: QueryIR,
  whereClause: BasicExpression<boolean>,
  outerAlias: string,
): boolean {
  return !(
    unsafeSelect(query, whereClause, outerAlias) ||
    unsafeGroupBy(query) ||
    unsafeHaving(query) ||
    unsafeOrderBy(query) ||
    unsafeFnSelect(query)
  )
}

/**
 * Detects whether a SELECT projection contains any aggregate expressions.
 * Recursively traverses nested select objects.
 *
 * @param select - The SELECT object from the IR
 * @returns True if any field is an aggregate, false otherwise
 */
function selectHasAggregates(select: Select): boolean {
  for (const value of Object.values(select)) {
    if (typeof value === `object`) {
      const v: any = value
      if (v.type === `agg`) return true
      if (!(`type` in v)) {
        if (selectHasAggregates(v as unknown as Select)) return true
      }
    }
  }
  return false
}

/**
 * Recursively collects all PropRef references from an expression.
 *
 * @param expr - The expression to traverse
 * @returns Array of PropRef references found in the expression
 */
function collectRefs(expr: any): Array<PropRef> {
  const refs: Array<PropRef> = []

  if (expr == null || typeof expr !== `object`) return refs

  switch (expr.type) {
    case `ref`:
      refs.push(expr as PropRef)
      break
    case `func`:
    case `agg`:
      for (const arg of expr.args ?? []) {
        refs.push(...collectRefs(arg))
      }
      break
    default:
      break
  }

  return refs
}

/**
 * Determines whether the provided WHERE clause references fields that are
 * computed by a subquery SELECT rather than pass-through properties.
 *
 * If true, pushing the WHERE clause into the subquery could change semantics
 * (since computed fields do not necessarily exist at the subquery input level),
 * so predicate pushdown must be avoided.
 *
 * @param select - The subquery SELECT map
 * @param whereClause - The WHERE expression to analyze
 * @param outerAlias - The alias of the subquery in the outer query
 * @returns True if WHERE references computed fields, otherwise false
 */
function whereReferencesComputedSelectFields(
  select: Select,
  whereClause: BasicExpression<boolean>,
  outerAlias: string,
): boolean {
  // Build a set of computed field names at the top-level of the subquery output
  const computed = new Set<string>()
  for (const [key, value] of Object.entries(select)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) continue
    if (value instanceof PropRef) continue
    // Nested object or non-PropRef expression counts as computed
    computed.add(key)
  }

  const refs = collectRefs(whereClause)

  for (const ref of refs) {
    const path = (ref as any).path as Array<string>
    if (!Array.isArray(path) || path.length < 2) continue
    const alias = path[0]
    const field = path[1] as string
    if (alias !== outerAlias) continue
    if (computed.has(field)) return true
  }
  return false
}

/**
 * Detects whether a WHERE clause references the subquery alias through fields that
 * are re-exposed under different names (renamed SELECT projections or fnSelect output).
 * In those cases we keep the clause at the outer level to avoid alias remapping bugs.
 * TODO: in future we should handle this by rewriting the clause to use the subquery's
 * internal field references, but it likely needs a wider refactor to do cleanly.
 */
function referencesAliasWithRemappedSelect(
  subquery: QueryIR,
  whereClause: BasicExpression<boolean>,
  outerAlias: string,
): boolean {
  const refs = collectRefs(whereClause)
  // Only care about clauses that actually reference the outer alias.
  if (refs.every((ref) => ref.path[0] !== outerAlias)) {
    return false
  }

  // fnSelect always rewrites the row shape, so alias-safe pushdown is impossible.
  if (subquery.fnSelect) {
    return true
  }

  const select = subquery.select
  // Without an explicit SELECT the clause still refers to the original collection.
  if (!select) {
    return false
  }

  for (const ref of refs) {
    const path = ref.path
    // Need at least alias + field to matter.
    if (path.length < 2) continue
    if (path[0] !== outerAlias) continue

    const projected = select[path[1]!]
    // Unselected fields can't be remapped, so skip - only care about fields in the SELECT.
    if (!projected) continue

    // Non-PropRef projections are computed values; cannot push down.
    if (!(projected instanceof PropRef)) {
      return true
    }

    // If the projection is just the alias (whole row) without a specific field,
    // we can't verify whether the field we're referencing is being preserved or remapped.
    if (projected.path.length < 2) {
      return true
    }

    const [innerAlias, innerField] = projected.path

    // Safe only when the projection points straight back to the same alias or the
    // underlying source alias and preserves the field name.
    if (innerAlias !== outerAlias && innerAlias !== subquery.from.alias) {
      return true
    }

    if (innerField !== path[1]) {
      return true
    }
  }

  return false
}

/**
 * Helper function to combine multiple expressions with AND.
 *
 * If there's only one expression, it's returned as-is.
 * If there are multiple expressions, they're combined with an AND function.
 *
 * @param expressions - Array of expressions to combine
 * @returns Single expression representing the AND combination
 * @throws Error if the expressions array is empty
 */
function combineWithAnd(
  expressions: Array<BasicExpression<boolean>>,
): BasicExpression<boolean> {
  if (expressions.length === 0) {
    throw new CannotCombineEmptyExpressionListError()
  }

  if (expressions.length === 1) {
    return expressions[0]!
  }

  // Create an AND function with all expressions as arguments
  return new Func(`and`, expressions)
}
