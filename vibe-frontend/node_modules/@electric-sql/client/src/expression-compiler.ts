import { SerializedExpression, SerializedOrderByClause } from './types'
import { quoteIdentifier } from './column-mapper'

/**
 * Compiles a serialized expression into a SQL string.
 * Applies columnMapper transformations to column references.
 *
 * @param expr - The serialized expression to compile
 * @param columnMapper - Optional function to transform column names (e.g., camelCase to snake_case)
 * @returns The compiled SQL string
 *
 * @example
 * ```typescript
 * const expr = { type: 'ref', column: 'userId' }
 * compileExpression(expr, camelToSnake) // '"user_id"'
 * ```
 */
export function compileExpression(
  expr: SerializedExpression,
  columnMapper?: (col: string) => string
): string {
  switch (expr.type) {
    case `ref`: {
      // Apply columnMapper, then quote
      const mappedColumn = columnMapper
        ? columnMapper(expr.column)
        : expr.column
      return quoteIdentifier(mappedColumn)
    }
    case `val`:
      return `$${expr.paramIndex}`
    case `func`:
      return compileFunction(expr, columnMapper)
    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = expr
      throw new Error(`Unknown expression type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/**
 * Compiles a function expression into SQL.
 */
function compileFunction(
  expr: { type: `func`; name: string; args: SerializedExpression[] },
  columnMapper?: (col: string) => string
): string {
  const args = expr.args.map((arg) => compileExpression(arg, columnMapper))

  switch (expr.name) {
    // Binary comparison operators
    case `eq`:
      return `${args[0]} = ${args[1]}`
    case `gt`:
      return `${args[0]} > ${args[1]}`
    case `gte`:
      return `${args[0]} >= ${args[1]}`
    case `lt`:
      return `${args[0]} < ${args[1]}`
    case `lte`:
      return `${args[0]} <= ${args[1]}`

    // Logical operators
    case `and`:
      return args.map((a) => `(${a})`).join(` AND `)
    case `or`:
      return args.map((a) => `(${a})`).join(` OR `)
    case `not`:
      return `NOT (${args[0]})`

    // Special operators
    case `in`:
      return `${args[0]} = ANY(${args[1]})`
    case `like`:
      return `${args[0]} LIKE ${args[1]}`
    case `ilike`:
      return `${args[0]} ILIKE ${args[1]}`
    case `isNull`:
    case `isUndefined`:
      return `${args[0]} IS NULL`

    // String functions
    case `upper`:
      return `UPPER(${args[0]})`
    case `lower`:
      return `LOWER(${args[0]})`
    case `length`:
      return `LENGTH(${args[0]})`
    case `concat`:
      return `CONCAT(${args.join(`, `)})`

    // Other functions
    case `coalesce`:
      return `COALESCE(${args.join(`, `)})`

    default:
      throw new Error(`Unknown function: ${expr.name}`)
  }
}

/**
 * Compiles serialized ORDER BY clauses into a SQL string.
 * Applies columnMapper transformations to column references.
 *
 * @param clauses - The serialized ORDER BY clauses to compile
 * @param columnMapper - Optional function to transform column names
 * @returns The compiled SQL ORDER BY string
 *
 * @example
 * ```typescript
 * const clauses = [{ column: 'createdAt', direction: 'desc', nulls: 'first' }]
 * compileOrderBy(clauses, camelToSnake) // '"created_at" DESC NULLS FIRST'
 * ```
 */
export function compileOrderBy(
  clauses: SerializedOrderByClause[],
  columnMapper?: (col: string) => string
): string {
  return clauses
    .map((clause) => {
      const mappedColumn = columnMapper
        ? columnMapper(clause.column)
        : clause.column
      let sql = quoteIdentifier(mappedColumn)
      if (clause.direction === `desc`) sql += ` DESC`
      if (clause.nulls === `first`) sql += ` NULLS FIRST`
      if (clause.nulls === `last`) sql += ` NULLS LAST`
      return sql
    })
    .join(`, `)
}
