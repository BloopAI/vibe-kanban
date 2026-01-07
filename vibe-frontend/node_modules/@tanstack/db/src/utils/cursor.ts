import { and, eq, gt, lt, or } from '../query/builder/functions.js'
import { Value } from '../query/ir.js'
import type { BasicExpression, OrderBy } from '../query/ir.js'

/**
 * Builds a cursor expression for paginating through ordered results.
 * For multi-column orderBy, creates a composite cursor that respects all columns.
 *
 * For [col1 ASC, col2 DESC] with values [v1, v2], produces:
 *   or(
 *     gt(col1, v1),                         // col1 > v1
 *     and(eq(col1, v1), lt(col2, v2))       // col1 = v1 AND col2 < v2 (DESC)
 *   )
 *
 * This creates a precise cursor that works with composite indexes on the backend.
 *
 * @param orderBy - The order-by clauses defining sort columns and directions
 * @param values - The cursor values corresponding to each order-by column
 * @returns A filter expression for rows after the cursor position, or undefined if empty
 */
export function buildCursor(
  orderBy: OrderBy,
  values: Array<unknown>,
): BasicExpression<boolean> | undefined {
  if (values.length === 0 || orderBy.length === 0) {
    return undefined
  }

  // For single column, just use simple gt/lt
  if (orderBy.length === 1) {
    const { expression, compareOptions } = orderBy[0]!
    const operator = compareOptions.direction === `asc` ? gt : lt
    return operator(expression, new Value(values[0]))
  }

  // For multi-column, build the composite cursor:
  // or(
  //   gt(col1, v1),
  //   and(eq(col1, v1), gt(col2, v2)),
  //   and(eq(col1, v1), eq(col2, v2), gt(col3, v3)),
  //   ...
  // )
  const clauses: Array<BasicExpression<boolean>> = []

  for (let i = 0; i < orderBy.length && i < values.length; i++) {
    const clause = orderBy[i]!
    const value = values[i]

    // Build equality conditions for all previous columns
    const eqConditions: Array<BasicExpression<boolean>> = []
    for (let j = 0; j < i; j++) {
      const prevClause = orderBy[j]!
      const prevValue = values[j]
      eqConditions.push(eq(prevClause.expression, new Value(prevValue)))
    }

    // Add the comparison for the current column (respecting direction)
    const operator = clause.compareOptions.direction === `asc` ? gt : lt
    const comparison = operator(clause.expression, new Value(value))

    if (eqConditions.length === 0) {
      // First column: just the comparison
      clauses.push(comparison)
    } else {
      // Subsequent columns: and(eq(prev...), comparison)
      // We need to spread into and() which expects at least 2 args
      const allConditions = [...eqConditions, comparison]
      clauses.push(allConditions.reduce((acc, cond) => and(acc, cond)))
    }
  }

  // Combine all clauses with OR
  if (clauses.length === 1) {
    return clauses[0]!
  }
  // Use reduce to combine with or() which expects exactly 2 args
  return clauses.reduce((acc, clause) => or(acc, clause))
}
