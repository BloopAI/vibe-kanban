import { Func, PropRef, Value } from '../ir.js'
import type { BasicExpression, OrderBy } from '../ir.js'

/**
 * Normalizes a WHERE clause expression by removing table aliases from property references.
 *
 * This function recursively traverses an expression tree and creates new BasicExpression
 * instances with normalized paths. The main transformation is removing the collection alias
 * from property reference paths (e.g., `['user', 'id']` becomes `['id']` when `collectionAlias`
 * is `'user'`), which is needed when converting query-level expressions to collection-level
 * expressions for subscriptions.
 *
 * @param whereClause - The WHERE clause expression to normalize
 * @param collectionAlias - The alias of the collection being filtered (to strip from paths)
 * @returns A new BasicExpression with normalized paths
 *
 * @example
 * // Input: ref with path ['user', 'id'] where collectionAlias is 'user'
 * // Output: ref with path ['id']
 */
export function normalizeExpressionPaths(
  whereClause: BasicExpression<boolean>,
  collectionAlias: string,
): BasicExpression<boolean> {
  const tpe = whereClause.type
  if (tpe === `val`) {
    return new Value(whereClause.value)
  } else if (tpe === `ref`) {
    const path = whereClause.path
    if (Array.isArray(path)) {
      if (path[0] === collectionAlias && path.length > 1) {
        // Remove the table alias from the path for single-collection queries
        return new PropRef(path.slice(1))
      } else if (path.length === 1 && path[0] !== undefined) {
        // Single field reference
        return new PropRef([path[0]])
      }
    }
    // Fallback for non-array paths
    return new PropRef(Array.isArray(path) ? path : [String(path)])
  } else {
    // Recursively convert all arguments
    const args: Array<BasicExpression> = []
    for (const arg of whereClause.args) {
      const convertedArg = normalizeExpressionPaths(
        arg as BasicExpression<boolean>,
        collectionAlias,
      )
      args.push(convertedArg)
    }
    return new Func(whereClause.name, args)
  }
}

export function normalizeOrderByPaths(
  orderBy: OrderBy,
  collectionAlias: string,
): OrderBy {
  const normalizedOrderBy = orderBy.map((clause) => {
    const basicExp = normalizeExpressionPaths(
      clause.expression,
      collectionAlias,
    )

    return {
      ...clause,
      expression: basicExp,
    }
  })

  return normalizedOrderBy
}
