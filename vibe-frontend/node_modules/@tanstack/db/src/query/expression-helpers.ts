/**
 * Expression Helpers for TanStack DB
 *
 * These utilities help parse LoadSubsetOptions (where, orderBy, limit) from TanStack DB
 * into formats suitable for your API backend. They provide a generic way to traverse
 * expression trees without having to implement your own parser.
 *
 * @example
 * ```typescript
 * import { parseWhereExpression, parseOrderByExpression } from '@tanstack/db'
 *
 * queryFn: async (ctx) => {
 *   const { limit, where, orderBy } = ctx.meta?.loadSubsetOptions ?? {}
 *
 *   // Convert expression tree to filters
 *   const filters = parseWhereExpression(where, {
 *     eq: (field, value) => ({ [field]: value }),
 *     lt: (field, value) => ({ [`${field}_lt`]: value }),
 *     and: (filters) => Object.assign({}, ...filters)
 *   })
 *
 *   // Extract sort information
 *   const sort = parseOrderByExpression(orderBy)
 *
 *   return api.getProducts({ ...filters, sort, limit })
 * }
 * ```
 */

import type { IR, OperatorName } from '../index.js'

type BasicExpression<T = any> = IR.BasicExpression<T>
type OrderBy = IR.OrderBy

/**
 * Represents a simple field path extracted from an expression.
 * Can include string keys for object properties and numbers for array indices.
 */
export type FieldPath = Array<string | number>

/**
 * Represents a simple comparison operation
 */
export interface SimpleComparison {
  field: FieldPath
  operator: string
  value?: any // Optional for operators like isNull and isUndefined that don't have a value
}

/**
 * Options for customizing how WHERE expressions are parsed
 */
export interface ParseWhereOptions<T = any> {
  /**
   * Handler functions for different operators.
   * Each handler receives the parsed field path(s) and value(s) and returns your custom format.
   *
   * Supported operators from TanStack DB:
   * - Comparison: eq, gt, gte, lt, lte, in, like, ilike
   * - Logical: and, or, not
   * - Null checking: isNull, isUndefined
   * - String functions: upper, lower, length, concat
   * - Numeric: add
   * - Utility: coalesce
   * - Aggregates: count, avg, sum, min, max
   */
  handlers: {
    [K in OperatorName]?: (...args: Array<any>) => T
  } & {
    [key: string]: (...args: Array<any>) => T
  }
  /**
   * Optional handler for when an unknown operator is encountered.
   * If not provided, unknown operators throw an error.
   */
  onUnknownOperator?: (operator: string, args: Array<any>) => T
}

/**
 * Result of parsing an ORDER BY expression
 */
export interface ParsedOrderBy {
  field: FieldPath
  direction: `asc` | `desc`
  nulls: `first` | `last`
  /** String sorting method: 'lexical' (default) or 'locale' (locale-aware) */
  stringSort?: `lexical` | `locale`
  /** Locale for locale-aware string sorting (e.g., 'en-US') */
  locale?: string
  /** Additional options for locale-aware sorting */
  localeOptions?: object
}

/**
 * Extracts the field path from a PropRef expression.
 * Returns null for non-ref expressions.
 *
 * @param expr - The expression to extract from
 * @returns The field path array, or null
 *
 * @example
 * ```typescript
 * const field = extractFieldPath(someExpression)
 * // Returns: ['product', 'category']
 * ```
 */
export function extractFieldPath(expr: BasicExpression): FieldPath | null {
  if (expr.type === `ref`) {
    return expr.path
  }
  return null
}

/**
 * Extracts the value from a Value expression.
 * Returns undefined for non-value expressions.
 *
 * @param expr - The expression to extract from
 * @returns The extracted value
 *
 * @example
 * ```typescript
 * const val = extractValue(someExpression)
 * // Returns: 'electronics'
 * ```
 */
export function extractValue(expr: BasicExpression): any {
  if (expr.type === `val`) {
    return expr.value
  }
  return undefined
}

/**
 * Generic expression tree walker that visits each node in the expression.
 * Useful for implementing custom parsing logic.
 *
 * @param expr - The expression to walk
 * @param visitor - Visitor function called for each node
 *
 * @example
 * ```typescript
 * walkExpression(whereExpr, (node) => {
 *   if (node.type === 'func' && node.name === 'eq') {
 *     console.log('Found equality comparison')
 *   }
 * })
 * ```
 */
export function walkExpression(
  expr: BasicExpression | undefined | null,
  visitor: (node: BasicExpression) => void,
): void {
  if (!expr) return

  visitor(expr)

  if (expr.type === `func`) {
    expr.args.forEach((arg: BasicExpression) => walkExpression(arg, visitor))
  }
}

/**
 * Parses a WHERE expression into a custom format using provided handlers.
 *
 * This is the main helper for converting TanStack DB where clauses into your API's filter format.
 * You provide handlers for each operator, and this function traverses the expression tree
 * and calls the appropriate handlers.
 *
 * @param expr - The WHERE expression to parse
 * @param options - Configuration with handler functions for each operator
 * @returns The parsed result in your custom format
 *
 * @example
 * ```typescript
 * // REST API with query parameters
 * const filters = parseWhereExpression(where, {
 *   handlers: {
 *     eq: (field, value) => ({ [field.join('.')]: value }),
 *     lt: (field, value) => ({ [`${field.join('.')}_lt`]: value }),
 *     gt: (field, value) => ({ [`${field.join('.')}_gt`]: value }),
 *     and: (...filters) => Object.assign({}, ...filters),
 *     or: (...filters) => ({ $or: filters })
 *   }
 * })
 * // Returns: { category: 'electronics', price_lt: 100 }
 * ```
 *
 * @example
 * ```typescript
 * // GraphQL where clause
 * const where = parseWhereExpression(whereExpr, {
 *   handlers: {
 *     eq: (field, value) => ({ [field.join('_')]: { _eq: value } }),
 *     lt: (field, value) => ({ [field.join('_')]: { _lt: value } }),
 *     and: (...filters) => ({ _and: filters })
 *   }
 * })
 * ```
 */
export function parseWhereExpression<T = any>(
  expr: BasicExpression<boolean> | undefined | null,
  options: ParseWhereOptions<T>,
): T | null {
  if (!expr) return null

  const { handlers, onUnknownOperator } = options

  // Handle value expressions
  if (expr.type === `val`) {
    return expr.value as unknown as T
  }

  // Handle property references
  if (expr.type === `ref`) {
    return expr.path as unknown as T
  }

  // Handle function expressions
  // After checking val and ref, expr must be func
  const { name, args } = expr
  const handler = handlers[name]

  if (!handler) {
    if (onUnknownOperator) {
      return onUnknownOperator(name, args)
    }
    throw new Error(
      `No handler provided for operator: ${name}. Available handlers: ${Object.keys(handlers).join(`, `)}`,
    )
  }

  // Parse arguments recursively
  const parsedArgs = args.map((arg: BasicExpression) => {
    // For refs, extract the field path
    if (arg.type === `ref`) {
      return arg.path
    }
    // For values, extract the value
    if (arg.type === `val`) {
      return arg.value
    }
    // For nested functions, recurse (after checking ref and val, must be func)
    return parseWhereExpression(arg, options)
  })

  return handler(...parsedArgs)
}

/**
 * Parses an ORDER BY expression into a simple array of sort specifications.
 *
 * @param orderBy - The ORDER BY expression array
 * @returns Array of parsed order by specifications
 *
 * @example
 * ```typescript
 * const sorts = parseOrderByExpression(orderBy)
 * // Returns: [
 * //   { field: ['category'], direction: 'asc', nulls: 'last' },
 * //   { field: ['price'], direction: 'desc', nulls: 'last' }
 * // ]
 * ```
 */
export function parseOrderByExpression(
  orderBy: OrderBy | undefined | null,
): Array<ParsedOrderBy> {
  if (!orderBy || orderBy.length === 0) {
    return []
  }

  return orderBy.map((clause: IR.OrderByClause) => {
    const field = extractFieldPath(clause.expression)

    if (!field) {
      throw new Error(
        `ORDER BY expression must be a field reference, got: ${clause.expression.type}`,
      )
    }

    const { direction, nulls } = clause.compareOptions
    const result: ParsedOrderBy = {
      field,
      direction,
      nulls,
    }

    // Add string collation options if present (discriminated union)
    if (`stringSort` in clause.compareOptions) {
      result.stringSort = clause.compareOptions.stringSort
    }
    if (`locale` in clause.compareOptions) {
      result.locale = clause.compareOptions.locale
    }
    if (`localeOptions` in clause.compareOptions) {
      result.localeOptions = clause.compareOptions.localeOptions
    }

    return result
  })
}

/**
 * Extracts all simple comparisons from a WHERE expression.
 * This is useful for simple APIs that only support basic filters.
 *
 * Note: This only works for simple AND-ed conditions and NOT-wrapped comparisons.
 * Throws an error if it encounters unsupported operations like OR or complex nested expressions.
 *
 * NOT operators are flattened by prefixing the operator name (e.g., `not(eq(...))` becomes `not_eq`).
 *
 * @param expr - The WHERE expression to parse
 * @returns Array of simple comparisons
 * @throws Error if expression contains OR or other unsupported operations
 *
 * @example
 * ```typescript
 * const comparisons = extractSimpleComparisons(where)
 * // Returns: [
 * //   { field: ['category'], operator: 'eq', value: 'electronics' },
 * //   { field: ['price'], operator: 'lt', value: 100 },
 * //   { field: ['email'], operator: 'isNull' }, // No value for null checks
 * //   { field: ['status'], operator: 'not_eq', value: 'archived' }
 * // ]
 * ```
 */
export function extractSimpleComparisons(
  expr: BasicExpression<boolean> | undefined | null,
): Array<SimpleComparison> {
  if (!expr) return []

  const comparisons: Array<SimpleComparison> = []

  function extract(e: BasicExpression): void {
    if (e.type === `func`) {
      // Handle AND - recurse into both sides
      if (e.name === `and`) {
        e.args.forEach((arg: BasicExpression) => extract(arg))
        return
      }

      // Handle NOT - recurse into argument and prefix operator with 'not_'
      if (e.name === `not`) {
        const [arg] = e.args
        if (!arg || arg.type !== `func`) {
          throw new Error(
            `extractSimpleComparisons requires a comparison or null check inside 'not' operator.`,
          )
        }

        // Handle NOT with null/undefined checks
        const nullCheckOps = [`isNull`, `isUndefined`]
        if (nullCheckOps.includes(arg.name)) {
          const [fieldArg] = arg.args
          const field = fieldArg?.type === `ref` ? fieldArg.path : null

          if (field) {
            comparisons.push({
              field,
              operator: `not_${arg.name}`,
              // No value for null/undefined checks
            })
          } else {
            throw new Error(
              `extractSimpleComparisons requires a field reference for '${arg.name}' operator.`,
            )
          }
          return
        }

        // Handle NOT with comparison operators
        const comparisonOps = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`]
        if (comparisonOps.includes(arg.name)) {
          const [leftArg, rightArg] = arg.args
          const field = leftArg?.type === `ref` ? leftArg.path : null
          const value = rightArg?.type === `val` ? rightArg.value : null

          if (field && value !== undefined) {
            comparisons.push({
              field,
              operator: `not_${arg.name}`,
              value,
            })
          } else {
            throw new Error(
              `extractSimpleComparisons requires simple field-value comparisons. Found complex expression for 'not(${arg.name})' operator.`,
            )
          }
          return
        }

        // NOT can only wrap simple comparisons or null checks
        throw new Error(
          `extractSimpleComparisons does not support 'not(${arg.name})'. NOT can only wrap comparison operators (eq, gt, gte, lt, lte, in) or null checks (isNull, isUndefined).`,
        )
      }

      // Throw on unsupported operations
      const unsupportedOps = [
        `or`,
        `like`,
        `ilike`,
        `upper`,
        `lower`,
        `length`,
        `concat`,
        `add`,
        `coalesce`,
        `count`,
        `avg`,
        `sum`,
        `min`,
        `max`,
      ]
      if (unsupportedOps.includes(e.name)) {
        throw new Error(
          `extractSimpleComparisons does not support '${e.name}' operator. Use parseWhereExpression with custom handlers for complex expressions.`,
        )
      }

      // Handle null/undefined check operators (single argument, no value)
      const nullCheckOps = [`isNull`, `isUndefined`]
      if (nullCheckOps.includes(e.name)) {
        const [fieldArg] = e.args

        // Extract field (must be a ref)
        const field = fieldArg?.type === `ref` ? fieldArg.path : null

        if (field) {
          comparisons.push({
            field,
            operator: e.name,
            // No value for null/undefined checks
          })
        } else {
          throw new Error(
            `extractSimpleComparisons requires a field reference for '${e.name}' operator.`,
          )
        }
        return
      }

      // Handle comparison operators
      const comparisonOps = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`]
      if (comparisonOps.includes(e.name)) {
        const [leftArg, rightArg] = e.args

        // Extract field and value
        const field = leftArg?.type === `ref` ? leftArg.path : null
        const value = rightArg?.type === `val` ? rightArg.value : null

        if (field && value !== undefined) {
          comparisons.push({
            field,
            operator: e.name,
            value,
          })
        } else {
          throw new Error(
            `extractSimpleComparisons requires simple field-value comparisons. Found complex expression for '${e.name}' operator.`,
          )
        }
      } else {
        // Unknown operator
        throw new Error(
          `extractSimpleComparisons encountered unknown operator: '${e.name}'`,
        )
      }
    }
  }

  extract(expr)
  return comparisons
}

/**
 * Convenience function to get all LoadSubsetOptions in a pre-parsed format.
 * Good starting point for simple use cases.
 *
 * @param options - The LoadSubsetOptions from ctx.meta
 * @returns Pre-parsed filters, sorts, and limit
 *
 * @example
 * ```typescript
 * queryFn: async (ctx) => {
 *   const parsed = parseLoadSubsetOptions(ctx.meta?.loadSubsetOptions)
 *
 *   // Convert to your API format
 *   return api.getProducts({
 *     ...Object.fromEntries(
 *       parsed.filters.map(f => [`${f.field.join('.')}_${f.operator}`, f.value])
 *     ),
 *     sort: parsed.sorts.map(s => `${s.field.join('.')}:${s.direction}`).join(','),
 *     limit: parsed.limit
 *   })
 * }
 * ```
 */
export function parseLoadSubsetOptions(
  options:
    | {
        where?: BasicExpression<boolean>
        orderBy?: OrderBy
        limit?: number
      }
    | undefined
    | null,
): {
  filters: Array<SimpleComparison>
  sorts: Array<ParsedOrderBy>
  limit?: number
} {
  if (!options) {
    return { filters: [], sorts: [] }
  }

  return {
    filters: extractSimpleComparisons(options.where),
    sorts: parseOrderByExpression(options.orderBy),
    limit: options.limit,
  }
}
