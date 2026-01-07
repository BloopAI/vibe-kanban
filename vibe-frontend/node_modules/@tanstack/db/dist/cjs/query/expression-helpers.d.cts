import { IR, OperatorName } from '../index.js';
type BasicExpression<T = any> = IR.BasicExpression<T>;
type OrderBy = IR.OrderBy;
/**
 * Represents a simple field path extracted from an expression.
 * Can include string keys for object properties and numbers for array indices.
 */
export type FieldPath = Array<string | number>;
/**
 * Represents a simple comparison operation
 */
export interface SimpleComparison {
    field: FieldPath;
    operator: string;
    value?: any;
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
        [K in OperatorName]?: (...args: Array<any>) => T;
    } & {
        [key: string]: (...args: Array<any>) => T;
    };
    /**
     * Optional handler for when an unknown operator is encountered.
     * If not provided, unknown operators throw an error.
     */
    onUnknownOperator?: (operator: string, args: Array<any>) => T;
}
/**
 * Result of parsing an ORDER BY expression
 */
export interface ParsedOrderBy {
    field: FieldPath;
    direction: `asc` | `desc`;
    nulls: `first` | `last`;
    /** String sorting method: 'lexical' (default) or 'locale' (locale-aware) */
    stringSort?: `lexical` | `locale`;
    /** Locale for locale-aware string sorting (e.g., 'en-US') */
    locale?: string;
    /** Additional options for locale-aware sorting */
    localeOptions?: object;
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
export declare function extractFieldPath(expr: BasicExpression): FieldPath | null;
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
export declare function extractValue(expr: BasicExpression): any;
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
export declare function walkExpression(expr: BasicExpression | undefined | null, visitor: (node: BasicExpression) => void): void;
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
export declare function parseWhereExpression<T = any>(expr: BasicExpression<boolean> | undefined | null, options: ParseWhereOptions<T>): T | null;
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
export declare function parseOrderByExpression(orderBy: OrderBy | undefined | null): Array<ParsedOrderBy>;
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
export declare function extractSimpleComparisons(expr: BasicExpression<boolean> | undefined | null): Array<SimpleComparison>;
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
export declare function parseLoadSubsetOptions(options: {
    where?: BasicExpression<boolean>;
    orderBy?: OrderBy;
    limit?: number;
} | undefined | null): {
    filters: Array<SimpleComparison>;
    sorts: Array<ParsedOrderBy>;
    limit?: number;
};
export {};
