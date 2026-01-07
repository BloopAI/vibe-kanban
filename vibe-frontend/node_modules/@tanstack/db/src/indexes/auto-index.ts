import { DEFAULT_COMPARE_OPTIONS } from '../utils'
import { BTreeIndex } from './btree-index'
import type { CompareOptions } from '../query/builder/types'
import type { BasicExpression } from '../query/ir'
import type { CollectionImpl } from '../collection/index.js'

export interface AutoIndexConfig {
  autoIndex?: `off` | `eager`
}

function shouldAutoIndex(collection: CollectionImpl<any, any, any, any, any>) {
  // Only proceed if auto-indexing is enabled
  if (collection.config.autoIndex !== `eager`) {
    return false
  }

  return true
}

export function ensureIndexForField<
  T extends Record<string, any>,
  TKey extends string | number,
>(
  fieldName: string,
  fieldPath: Array<string>,
  collection: CollectionImpl<T, TKey, any, any, any>,
  compareOptions?: CompareOptions,
  compareFn?: (a: any, b: any) => number,
) {
  if (!shouldAutoIndex(collection)) {
    return
  }

  const compareOpts = compareOptions ?? {
    ...DEFAULT_COMPARE_OPTIONS,
    ...collection.compareOptions,
  }

  // Check if we already have an index for this field
  const existingIndex = Array.from(collection.indexes.values()).find(
    (index) =>
      index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts),
  )

  if (existingIndex) {
    return // Index already exists
  }

  // Create a new index for this field using the collection's createIndex method
  try {
    // Use the proxy-based approach to create the proper accessor for nested paths
    collection.createIndex(
      (row) => {
        // Navigate through the field path
        let current: any = row
        for (const part of fieldPath) {
          current = current[part]
        }
        return current
      },
      {
        name: `auto:${fieldPath.join(`.`)}`,
        indexType: BTreeIndex,
        options: compareFn ? { compareFn, compareOptions: compareOpts } : {},
      },
    )
  } catch (error) {
    console.warn(
      `${collection.id ? `[${collection.id}] ` : ``}Failed to create auto-index for field path "${fieldPath.join(`.`)}":`,
      error,
    )
  }
}

/**
 * Analyzes a where expression and creates indexes for all simple operations on single fields
 */
export function ensureIndexForExpression<
  T extends Record<string, any>,
  TKey extends string | number,
>(
  expression: BasicExpression,
  collection: CollectionImpl<T, TKey, any, any, any>,
): void {
  if (!shouldAutoIndex(collection)) {
    return
  }

  // Extract all indexable expressions and create indexes for them
  const indexableExpressions = extractIndexableExpressions(expression)

  for (const { fieldName, fieldPath } of indexableExpressions) {
    ensureIndexForField(fieldName, fieldPath, collection)
  }
}

/**
 * Extracts all indexable expressions from a where expression
 */
function extractIndexableExpressions(
  expression: BasicExpression,
): Array<{ fieldName: string; fieldPath: Array<string> }> {
  const results: Array<{ fieldName: string; fieldPath: Array<string> }> = []

  function extractFromExpression(expr: BasicExpression): void {
    if (expr.type !== `func`) {
      return
    }

    const func = expr as any

    // Handle 'and' expressions by recursively processing all arguments
    if (func.name === `and`) {
      for (const arg of func.args) {
        extractFromExpression(arg)
      }
      return
    }

    // Check if this is a supported operation
    const supportedOperations = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`]
    if (!supportedOperations.includes(func.name)) {
      return
    }

    // Check if the first argument is a property reference
    if (func.args.length < 1 || func.args[0].type !== `ref`) {
      return
    }

    const fieldRef = func.args[0]
    const fieldPath = fieldRef.path

    // Skip if the path is empty
    if (fieldPath.length === 0) {
      return
    }

    // For nested paths, use the full path joined with underscores as the field name
    // For simple paths, use the first (and only) element
    const fieldName = fieldPath.join(`_`)
    results.push({ fieldName, fieldPath })
  }

  extractFromExpression(expression)
  return results
}
