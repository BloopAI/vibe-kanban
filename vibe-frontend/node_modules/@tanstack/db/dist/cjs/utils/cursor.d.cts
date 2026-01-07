import { BasicExpression, OrderBy } from '../query/ir.js';
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
export declare function buildCursor(orderBy: OrderBy, values: Array<unknown>): BasicExpression<boolean> | undefined;
