import { BasicExpression } from '../ir.js';
import { RefLeaf } from './types.js';
export interface RefProxy<T = any> {
    /** @internal */
    readonly __refProxy: true;
    /** @internal */
    readonly __path: Array<string>;
    /** @internal */
    readonly __type: T;
}
/**
 * Type for creating a RefProxy for a single row/type without namespacing
 * Used in collection indexes and where clauses
 */
export type SingleRowRefProxy<T> = T extends Record<string, any> ? {
    [K in keyof T]: T[K] extends Record<string, any> ? SingleRowRefProxy<T[K]> & RefProxy<T[K]> : RefLeaf<T[K]>;
} & RefProxy<T> : RefProxy<T>;
/**
 * Creates a proxy object that records property access paths for a single row
 * Used in collection indexes and where clauses
 */
export declare function createSingleRowRefProxy<T extends Record<string, any>>(): SingleRowRefProxy<T>;
/**
 * Creates a proxy object that records property access paths
 * Used in callbacks like where, select, etc. to create type-safe references
 */
export declare function createRefProxy<T extends Record<string, any>>(aliases: Array<string>): RefProxy<T> & T;
/**
 * Converts a value to an Expression
 * If it's a RefProxy, creates a Ref, otherwise creates a Value
 */
export declare function toExpression<T = any>(value: T): BasicExpression<T>;
export declare function toExpression(value: RefProxy<any>): BasicExpression<any>;
/**
 * Type guard to check if a value is a RefProxy
 */
export declare function isRefProxy(value: any): value is RefProxy;
/**
 * Helper to create a Value expression from a literal
 */
export declare function val<T>(value: T): BasicExpression<T>;
