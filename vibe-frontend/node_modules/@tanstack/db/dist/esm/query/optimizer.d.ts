import { BasicExpression, QueryIR } from './ir.js';
/**
 * Represents a WHERE clause after source analysis
 */
export interface AnalyzedWhereClause {
    /** The WHERE expression */
    expression: BasicExpression<boolean>;
    /** Set of table/source aliases that this WHERE clause touches */
    touchedSources: Set<string>;
    /** Whether this clause contains namespace-only references that prevent pushdown */
    hasNamespaceOnlyRef: boolean;
}
/**
 * Represents WHERE clauses grouped by the sources they touch
 */
export interface GroupedWhereClauses {
    /** WHERE clauses that touch only a single source, grouped by source alias */
    singleSource: Map<string, BasicExpression<boolean>>;
    /** WHERE clauses that touch multiple sources, combined into one expression */
    multiSource?: BasicExpression<boolean>;
}
/**
 * Result of query optimization including both the optimized query and collection-specific WHERE clauses
 */
export interface OptimizationResult {
    /** The optimized query with WHERE clauses potentially moved to subqueries */
    optimizedQuery: QueryIR;
    /** Map of source aliases to their extracted WHERE clauses for index optimization */
    sourceWhereClauses: Map<string, BasicExpression<boolean>>;
}
/**
 * Main query optimizer entry point that lifts WHERE clauses into subqueries.
 *
 * This function implements multi-level predicate pushdown optimization by recursively
 * moving WHERE clauses through nested subqueries to get them as close to the data
 * sources as possible, then removing redundant subqueries.
 *
 * @param query - The QueryIR to optimize
 * @returns An OptimizationResult with the optimized query and collection WHERE clause mapping
 *
 * @example
 * ```typescript
 * const originalQuery = {
 *   from: new CollectionRef(users, 'u'),
 *   join: [{ from: new CollectionRef(posts, 'p'), ... }],
 *   where: [eq(u.dept_id, 1), gt(p.views, 100)]
 * }
 *
 * const { optimizedQuery, sourceWhereClauses } = optimizeQuery(originalQuery)
 * // Result: Single-source clauses moved to deepest possible subqueries
 * // sourceWhereClauses: Map { 'u' => eq(u.dept_id, 1), 'p' => gt(p.views, 100) }
 * ```
 */
export declare function optimizeQuery(query: QueryIR): OptimizationResult;
