import { BasicExpression, OrderBy } from '../ir.js';
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
export declare function normalizeExpressionPaths(whereClause: BasicExpression<boolean>, collectionAlias: string): BasicExpression<boolean>;
export declare function normalizeOrderByPaths(orderBy: OrderBy, collectionAlias: string): OrderBy;
