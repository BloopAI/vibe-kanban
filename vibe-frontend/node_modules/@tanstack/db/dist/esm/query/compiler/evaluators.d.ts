import { BasicExpression } from '../ir.js';
import { NamespacedRow } from '../../types.js';
/**
 * Converts a 3-valued logic result to a boolean for use in WHERE/HAVING filters.
 * In SQL, UNKNOWN (null) values in WHERE clauses exclude rows, matching false behavior.
 *
 * @param result - The 3-valued logic result: true, false, or null (UNKNOWN)
 * @returns true only if result is explicitly true, false otherwise
 *
 * Truth table:
 * - true → true (include row)
 * - false → false (exclude row)
 * - null (UNKNOWN) → false (exclude row, matching SQL behavior)
 */
export declare function toBooleanPredicate(result: boolean | null): boolean;
/**
 * Compiled expression evaluator function type
 */
export type CompiledExpression = (namespacedRow: NamespacedRow) => any;
/**
 * Compiled single-row expression evaluator function type
 */
export type CompiledSingleRowExpression = (item: Record<string, unknown>) => any;
/**
 * Compiles an expression into an optimized evaluator function.
 * This eliminates branching during evaluation by pre-compiling the expression structure.
 */
export declare function compileExpression(expr: BasicExpression, isSingleRow?: boolean): CompiledExpression | CompiledSingleRowExpression;
/**
 * Compiles a single-row expression into an optimized evaluator function.
 */
export declare function compileSingleRowExpression(expr: BasicExpression): CompiledSingleRowExpression;
