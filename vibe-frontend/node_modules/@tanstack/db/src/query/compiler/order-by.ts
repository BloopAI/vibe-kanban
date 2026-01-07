import { orderByWithFractionalIndex } from '@tanstack/db-ivm'
import { defaultComparator, makeComparator } from '../../utils/comparison.js'
import { PropRef, followRef } from '../ir.js'
import { ensureIndexForField } from '../../indexes/auto-index.js'
import { findIndexForField } from '../../utils/index-optimization.js'
import { compileExpression } from './evaluators.js'
import { replaceAggregatesByRefs } from './group-by.js'
import type { CompareOptions } from '../builder/types.js'
import type { WindowOptions } from './types.js'
import type { CompiledSingleRowExpression } from './evaluators.js'
import type { OrderBy, OrderByClause, QueryIR, Select } from '../ir.js'
import type {
  CollectionLike,
  NamespacedAndKeyedStream,
  NamespacedRow,
} from '../../types.js'
import type { IStreamBuilder, KeyValue } from '@tanstack/db-ivm'
import type { IndexInterface } from '../../indexes/base-index.js'
import type { Collection } from '../../collection/index.js'

export type OrderByOptimizationInfo = {
  alias: string
  orderBy: OrderBy
  offset: number
  limit: number
  comparator: (
    a: Record<string, unknown> | null | undefined,
    b: Record<string, unknown> | null | undefined,
  ) => number
  /** Extracts all orderBy column values from a raw row (array for multi-column) */
  valueExtractorForRawRow: (row: Record<string, unknown>) => unknown
  /** Extracts only the first column value - used for index-based cursor */
  firstColumnValueExtractor: (row: Record<string, unknown>) => unknown
  /** Index on the first orderBy column - used for lazy loading */
  index?: IndexInterface<string | number>
  dataNeeded?: () => number
}

/**
 * Processes the ORDER BY clause
 * Works with the new structure that has both namespaced row data and __select_results
 * Always uses fractional indexing and adds the index as __ordering_index to the result
 */
export function processOrderBy(
  rawQuery: QueryIR,
  pipeline: NamespacedAndKeyedStream,
  orderByClause: Array<OrderByClause>,
  selectClause: Select,
  collection: Collection,
  optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>,
  setWindowFn: (windowFn: (options: WindowOptions) => void) => void,
  limit?: number,
  offset?: number,
): IStreamBuilder<KeyValue<unknown, [NamespacedRow, string]>> {
  // Pre-compile all order by expressions
  const compiledOrderBy = orderByClause.map((clause) => {
    const clauseWithoutAggregates = replaceAggregatesByRefs(
      clause.expression,
      selectClause,
      `__select_results`,
    )

    return {
      compiledExpression: compileExpression(clauseWithoutAggregates),
      compareOptions: buildCompareOptions(clause, collection),
    }
  })

  // Create a value extractor function for the orderBy operator
  const valueExtractor = (row: NamespacedRow & { __select_results?: any }) => {
    // The namespaced row contains:
    // 1. Table aliases as top-level properties (e.g., row["tableName"])
    // 2. SELECT results in __select_results (e.g., row.__select_results["aggregateAlias"])
    // The replaceAggregatesByRefs function has already transformed any aggregate expressions
    // that match SELECT aggregates to use the __select_results namespace.
    const orderByContext = row

    if (orderByClause.length > 1) {
      // For multiple orderBy columns, create a composite key
      return compiledOrderBy.map((compiled) =>
        compiled.compiledExpression(orderByContext),
      )
    } else if (orderByClause.length === 1) {
      // For a single orderBy column, use the value directly
      const compiled = compiledOrderBy[0]!
      return compiled.compiledExpression(orderByContext)
    }

    // Default case - no ordering
    return null
  }

  // Create a multi-property comparator that respects the order and direction of each property
  const compare = (a: unknown, b: unknown) => {
    // If we're comparing arrays (multiple properties), compare each property in order
    if (orderByClause.length > 1) {
      const arrayA = a as Array<unknown>
      const arrayB = b as Array<unknown>
      for (let i = 0; i < orderByClause.length; i++) {
        const clause = compiledOrderBy[i]!
        const compareFn = makeComparator(clause.compareOptions)
        const result = compareFn(arrayA[i], arrayB[i])
        if (result !== 0) {
          return result
        }
      }
      return arrayA.length - arrayB.length
    }

    // Single property comparison
    if (orderByClause.length === 1) {
      const clause = compiledOrderBy[0]!
      const compareFn = makeComparator(clause.compareOptions)
      return compareFn(a, b)
    }

    return defaultComparator(a, b)
  }

  let setSizeCallback: ((getSize: () => number) => void) | undefined

  let orderByOptimizationInfo: OrderByOptimizationInfo | undefined

  // When there's a limit, we create orderByOptimizationInfo to pass orderBy/limit
  // to loadSubset so the sync layer can optimize the query.
  // We try to use an index on the FIRST orderBy column for lazy loading,
  // even for multi-column orderBy (using wider bounds on first column).
  if (limit) {
    let index: IndexInterface<string | number> | undefined
    let followRefCollection: Collection | undefined
    let firstColumnValueExtractor: CompiledSingleRowExpression | undefined
    let orderByAlias: string = rawQuery.from.alias

    // Try to create/find an index on the FIRST orderBy column for lazy loading
    const firstClause = orderByClause[0]!
    const firstOrderByExpression = firstClause.expression

    if (firstOrderByExpression.type === `ref`) {
      const followRefResult = followRef(
        rawQuery,
        firstOrderByExpression,
        collection,
      )

      if (followRefResult) {
        followRefCollection = followRefResult.collection
        const fieldName = followRefResult.path[0]
        const compareOpts = buildCompareOptions(
          firstClause,
          followRefCollection,
        )

        if (fieldName) {
          ensureIndexForField(
            fieldName,
            followRefResult.path,
            followRefCollection,
            compareOpts,
            compare,
          )
        }

        // First column value extractor - used for index cursor
        firstColumnValueExtractor = compileExpression(
          new PropRef(followRefResult.path),
          true,
        ) as CompiledSingleRowExpression

        index = findIndexForField(
          followRefCollection,
          followRefResult.path,
          compareOpts,
        )

        // Only use the index if it supports range queries
        if (!index?.supports(`gt`)) {
          index = undefined
        }

        orderByAlias =
          firstOrderByExpression.path.length > 1
            ? String(firstOrderByExpression.path[0])
            : rawQuery.from.alias
      }
    }

    // Only create comparator and value extractors if the first column is a ref expression
    // For aggregate or computed expressions, we can't extract values from raw collection rows
    if (!firstColumnValueExtractor) {
      // Skip optimization for non-ref expressions (aggregates, computed values, etc.)
      // The query will still work, but without lazy loading optimization
    } else {
      // Build value extractors for all columns (must all be ref expressions for multi-column)
      // Check if all orderBy expressions are ref types (required for multi-column extraction)
      const allColumnsAreRefs = orderByClause.every(
        (clause) => clause.expression.type === `ref`,
      )

      // Create extractors for all columns if they're all refs
      const allColumnExtractors:
        | Array<CompiledSingleRowExpression>
        | undefined = allColumnsAreRefs
        ? orderByClause.map((clause) => {
            // We know it's a ref since we checked allColumnsAreRefs
            const refExpr = clause.expression as PropRef
            const followResult = followRef(rawQuery, refExpr, collection)
            if (followResult) {
              return compileExpression(
                new PropRef(followResult.path),
                true,
              ) as CompiledSingleRowExpression
            }
            // Fallback for refs that don't follow
            return compileExpression(
              clause.expression,
              true,
            ) as CompiledSingleRowExpression
          })
        : undefined

      // Create a comparator for raw rows (used for tracking sent values)
      // This compares ALL orderBy columns for proper ordering
      const comparator = (
        a: Record<string, unknown> | null | undefined,
        b: Record<string, unknown> | null | undefined,
      ) => {
        if (orderByClause.length === 1) {
          // Single column: extract and compare
          const extractedA = a ? firstColumnValueExtractor(a) : a
          const extractedB = b ? firstColumnValueExtractor(b) : b
          return compare(extractedA, extractedB)
        }
        if (allColumnExtractors) {
          // Multi-column with all refs: extract all values and compare
          const extractAll = (
            row: Record<string, unknown> | null | undefined,
          ) => {
            if (!row) return row
            return allColumnExtractors.map((extractor) => extractor(row))
          }
          return compare(extractAll(a), extractAll(b))
        }
        // Fallback: can't compare (shouldn't happen since we skip non-ref cases)
        return 0
      }

      // Create a value extractor for raw rows that extracts ALL orderBy column values
      // This is used for tracking sent values and building composite cursors
      const rawRowValueExtractor = (row: Record<string, unknown>): unknown => {
        if (orderByClause.length === 1) {
          // Single column: return single value
          return firstColumnValueExtractor(row)
        }
        if (allColumnExtractors) {
          // Multi-column: return array of all values
          return allColumnExtractors.map((extractor) => extractor(row))
        }
        // Fallback (shouldn't happen)
        return undefined
      }

      orderByOptimizationInfo = {
        alias: orderByAlias,
        offset: offset ?? 0,
        limit,
        comparator,
        valueExtractorForRawRow: rawRowValueExtractor,
        firstColumnValueExtractor: firstColumnValueExtractor,
        index,
        orderBy: orderByClause,
      }

      // Store the optimization info keyed by collection ID
      // Use the followed collection if available, otherwise use the main collection
      const targetCollectionId = followRefCollection?.id ?? collection.id
      optimizableOrderByCollections[targetCollectionId] =
        orderByOptimizationInfo

      // Set up lazy loading callback if we have an index
      if (index) {
        setSizeCallback = (getSize: () => number) => {
          optimizableOrderByCollections[targetCollectionId]![`dataNeeded`] =
            () => {
              const size = getSize()
              return Math.max(0, orderByOptimizationInfo!.limit - size)
            }
        }
      }
    }
  }

  // Use fractional indexing and return the tuple [value, index]
  return pipeline.pipe(
    orderByWithFractionalIndex(valueExtractor, {
      limit,
      offset,
      comparator: compare,
      setSizeCallback,
      setWindowFn: (
        windowFn: (options: { offset?: number; limit?: number }) => void,
      ) => {
        setWindowFn(
          // We wrap the move function such that we update the orderByOptimizationInfo
          // because that is used by the `dataNeeded` callback to determine if we need to load more data
          (options) => {
            windowFn(options)
            if (orderByOptimizationInfo) {
              orderByOptimizationInfo.offset =
                options.offset ?? orderByOptimizationInfo.offset
              orderByOptimizationInfo.limit =
                options.limit ?? orderByOptimizationInfo.limit
            }
          },
        )
      },
    }),
    // orderByWithFractionalIndex returns [key, [value, index]] - we keep this format
  )
}

/**
 * Builds a comparison configuration object that uses the values provided in the orderBy clause.
 * If no string sort configuration is provided it defaults to the collection's string sort configuration.
 */
export function buildCompareOptions(
  clause: OrderByClause,
  collection: CollectionLike<any, any>,
): CompareOptions {
  if (clause.compareOptions.stringSort !== undefined) {
    return clause.compareOptions
  }

  return {
    ...collection.compareOptions,
    direction: clause.compareOptions.direction,
    nulls: clause.compareOptions.nulls,
  }
}
