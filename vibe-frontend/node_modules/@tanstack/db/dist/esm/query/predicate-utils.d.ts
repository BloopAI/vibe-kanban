import { BasicExpression, OrderBy } from './ir.js';
import { LoadSubsetOptions } from '../types.js';
/**
 * Check if one where clause is a logical subset of another.
 * Returns true if the subset predicate is more restrictive than (or equal to) the superset predicate.
 *
 * @example
 * // age > 20 is subset of age > 10 (more restrictive)
 * isWhereSubset(gt(ref('age'), val(20)), gt(ref('age'), val(10))) // true
 *
 * @example
 * // age > 10 AND name = 'X' is subset of age > 10 (more conditions)
 * isWhereSubset(and(gt(ref('age'), val(10)), eq(ref('name'), val('X'))), gt(ref('age'), val(10))) // true
 *
 * @param subset - The potentially more restrictive predicate
 * @param superset - The potentially less restrictive predicate
 * @returns true if subset logically implies superset
 */
export declare function isWhereSubset(subset: BasicExpression<boolean> | undefined, superset: BasicExpression<boolean> | undefined): boolean;
/**
 * Combine multiple where predicates with OR logic (union).
 * Returns a predicate that is satisfied when any input predicate is satisfied.
 * Simplifies when possible (e.g., age > 10 OR age > 20 → age > 10).
 *
 * @example
 * // Take least restrictive
 * unionWherePredicates([gt(ref('age'), val(10)), gt(ref('age'), val(20))]) // age > 10
 *
 * @example
 * // Combine equals into IN
 * unionWherePredicates([eq(ref('age'), val(5)), eq(ref('age'), val(10))]) // age IN [5, 10]
 *
 * @param predicates - Array of where predicates to union
 * @returns Combined predicate representing the union
 */
export declare function unionWherePredicates(predicates: Array<BasicExpression<boolean>>): BasicExpression<boolean>;
/**
 * Compute the difference between two where predicates: `fromPredicate AND NOT(subtractPredicate)`.
 * Returns the simplified predicate, or null if the difference cannot be simplified
 * (in which case the caller should fetch the full fromPredicate).
 *
 * @example
 * // Range difference
 * minusWherePredicates(
 *   gt(ref('age'), val(10)),      // age > 10
 *   gt(ref('age'), val(20))       // age > 20
 * ) // → age > 10 AND age <= 20
 *
 * @example
 * // Set difference
 * minusWherePredicates(
 *   inOp(ref('status'), ['A', 'B', 'C', 'D']),  // status IN ['A','B','C','D']
 *   inOp(ref('status'), ['B', 'C'])             // status IN ['B','C']
 * ) // → status IN ['A', 'D']
 *
 * @example
 * // Common conditions
 * minusWherePredicates(
 *   and(gt(ref('age'), val(10)), eq(ref('status'), val('active'))),  // age > 10 AND status = 'active'
 *   and(gt(ref('age'), val(20)), eq(ref('status'), val('active')))   // age > 20 AND status = 'active'
 * ) // → age > 10 AND age <= 20 AND status = 'active'
 *
 * @example
 * // Complete overlap - empty result
 * minusWherePredicates(
 *   gt(ref('age'), val(20)),     // age > 20
 *   gt(ref('age'), val(10))      // age > 10
 * ) // → {type: 'val', value: false} (empty set)
 *
 * @param fromPredicate - The predicate to subtract from
 * @param subtractPredicate - The predicate to subtract
 * @returns The simplified difference, or null if cannot be simplified
 */
export declare function minusWherePredicates(fromPredicate: BasicExpression<boolean> | undefined, subtractPredicate: BasicExpression<boolean> | undefined): BasicExpression<boolean> | null;
/**
 * Check if one orderBy clause is a subset of another.
 * Returns true if the subset ordering requirements are satisfied by the superset ordering.
 *
 * @example
 * // Subset is prefix of superset
 * isOrderBySubset([{expr: age, asc}], [{expr: age, asc}, {expr: name, desc}]) // true
 *
 * @param subset - The ordering requirements to check
 * @param superset - The ordering that might satisfy the requirements
 * @returns true if subset is satisfied by superset
 */
export declare function isOrderBySubset(subset: OrderBy | undefined, superset: OrderBy | undefined): boolean;
/**
 * Check if one limit is a subset of another.
 * Returns true if the subset limit requirements are satisfied by the superset limit.
 *
 * Note: This function does NOT consider offset. For offset-aware subset checking,
 * use `isOffsetLimitSubset` instead.
 *
 * @example
 * isLimitSubset(10, 20) // true (requesting 10 items when 20 are available)
 * isLimitSubset(20, 10) // false (requesting 20 items when only 10 are available)
 * isLimitSubset(10, undefined) // true (requesting 10 items when unlimited are available)
 *
 * @param subset - The limit requirement to check
 * @param superset - The limit that might satisfy the requirement
 * @returns true if subset is satisfied by superset
 */
export declare function isLimitSubset(subset: number | undefined, superset: number | undefined): boolean;
/**
 * Check if one offset+limit range is a subset of another.
 * Returns true if the subset range is fully contained within the superset range.
 *
 * A query with `{limit: 10, offset: 0}` loads rows [0, 10).
 * A query with `{limit: 10, offset: 20}` loads rows [20, 30).
 *
 * For subset to be satisfied by superset:
 * - Superset must start at or before subset (superset.offset <= subset.offset)
 * - Superset must end at or after subset (superset.offset + superset.limit >= subset.offset + subset.limit)
 *
 * @example
 * isOffsetLimitSubset({ offset: 0, limit: 5 }, { offset: 0, limit: 10 }) // true
 * isOffsetLimitSubset({ offset: 5, limit: 5 }, { offset: 0, limit: 10 }) // true (rows 5-9 within 0-9)
 * isOffsetLimitSubset({ offset: 5, limit: 10 }, { offset: 0, limit: 10 }) // false (rows 5-14 exceed 0-9)
 * isOffsetLimitSubset({ offset: 20, limit: 10 }, { offset: 0, limit: 10 }) // false (rows 20-29 outside 0-9)
 *
 * @param subset - The offset+limit requirements to check
 * @param superset - The offset+limit that might satisfy the requirements
 * @returns true if subset range is fully contained within superset range
 */
export declare function isOffsetLimitSubset(subset: {
    offset?: number;
    limit?: number;
}, superset: {
    offset?: number;
    limit?: number;
}): boolean;
/**
 * Check if one predicate (where + orderBy + limit + offset) is a subset of another.
 * Returns true if all aspects of the subset predicate are satisfied by the superset.
 *
 * @example
 * isPredicateSubset(
 *   { where: gt(ref('age'), val(20)), limit: 10 },
 *   { where: gt(ref('age'), val(10)), limit: 20 }
 * ) // true
 *
 * @param subset - The predicate requirements to check
 * @param superset - The predicate that might satisfy the requirements
 * @returns true if subset is satisfied by superset
 */
export declare function isPredicateSubset(subset: LoadSubsetOptions, superset: LoadSubsetOptions): boolean;
