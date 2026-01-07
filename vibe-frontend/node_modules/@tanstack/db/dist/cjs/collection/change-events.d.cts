import { ChangeMessage, CollectionLike, CurrentStateAsChangesOptions, SubscribeChangesOptions } from '../types.cjs';
import { SingleRowRefProxy } from '../query/builder/ref-proxy.cjs';
import { BasicExpression } from '../query/ir.js';
/**
 * Returns the current state of the collection as an array of changes
 * @param collection - The collection to get changes from
 * @param options - Options including optional where filter, orderBy, and limit
 * @returns An array of changes
 * @example
 * // Get all items as changes
 * const allChanges = currentStateAsChanges(collection)
 *
 * // Get only items matching a condition
 * const activeChanges = currentStateAsChanges(collection, {
 *   where: (row) => row.status === 'active'
 * })
 *
 * // Get only items using a pre-compiled expression
 * const activeChanges = currentStateAsChanges(collection, {
 *   where: eq(row.status, 'active')
 * })
 *
 * // Get items ordered by name with limit
 * const topUsers = currentStateAsChanges(collection, {
 *   orderBy: [{ expression: row.name, compareOptions: { direction: 'asc' } }],
 *   limit: 10
 * })
 *
 * // Get active users ordered by score (highest score first)
 * const topActiveUsers = currentStateAsChanges(collection, {
 *   where: eq(row.status, 'active'),
 *   orderBy: [{ expression: row.score, compareOptions: { direction: 'desc' } }],
 * })
 */
export declare function currentStateAsChanges<T extends object, TKey extends string | number>(collection: CollectionLike<T, TKey>, options?: CurrentStateAsChangesOptions): Array<ChangeMessage<T>> | void;
/**
 * Creates a filter function from a where callback
 * @param whereCallback - The callback function that defines the filter condition
 * @returns A function that takes an item and returns true if it matches the filter
 */
export declare function createFilterFunction<T extends object>(whereCallback: (row: SingleRowRefProxy<T>) => any): (item: T) => boolean;
/**
 * Creates a filter function from a pre-compiled expression
 * @param expression - The pre-compiled expression to evaluate
 * @returns A function that takes an item and returns true if it matches the filter
 */
export declare function createFilterFunctionFromExpression<T extends object>(expression: BasicExpression<boolean>): (item: T) => boolean;
/**
 * Creates a filtered callback that only calls the original callback with changes that match the where clause
 * @param originalCallback - The original callback to filter
 * @param options - The subscription options containing the where clause
 * @returns A filtered callback function
 */
export declare function createFilteredCallback<T extends object>(originalCallback: (changes: Array<ChangeMessage<T>>) => void, options: SubscribeChangesOptions): (changes: Array<ChangeMessage<T>>) => void;
