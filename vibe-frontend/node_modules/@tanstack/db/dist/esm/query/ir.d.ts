import { CompareOptions } from './builder/types.js';
import { Collection, CollectionImpl } from '../collection/index.js';
import { NamespacedRow } from '../types.js';
export interface QueryIR {
    from: From;
    select?: Select;
    join?: Join;
    where?: Array<Where>;
    groupBy?: GroupBy;
    having?: Array<Having>;
    orderBy?: OrderBy;
    limit?: Limit;
    offset?: Offset;
    distinct?: true;
    singleResult?: true;
    fnSelect?: (row: NamespacedRow) => any;
    fnWhere?: Array<(row: NamespacedRow) => any>;
    fnHaving?: Array<(row: NamespacedRow) => any>;
}
export type From = CollectionRef | QueryRef;
export type Select = {
    [alias: string]: BasicExpression | Aggregate | Select;
};
export type Join = Array<JoinClause>;
export interface JoinClause {
    from: CollectionRef | QueryRef;
    type: `left` | `right` | `inner` | `outer` | `full` | `cross`;
    left: BasicExpression;
    right: BasicExpression;
}
export type Where = BasicExpression<boolean> | {
    expression: BasicExpression<boolean>;
    residual?: boolean;
};
export type GroupBy = Array<BasicExpression>;
export type Having = Where;
export type OrderBy = Array<OrderByClause>;
export type OrderByClause = {
    expression: BasicExpression;
    compareOptions: CompareOptions;
};
export type OrderByDirection = `asc` | `desc`;
export type Limit = number;
export type Offset = number;
declare abstract class BaseExpression<T = any> {
    abstract type: string;
    /** @internal - Type brand for TypeScript inference */
    readonly __returnType: T;
}
export declare class CollectionRef extends BaseExpression {
    collection: CollectionImpl;
    alias: string;
    type: "collectionRef";
    constructor(collection: CollectionImpl, alias: string);
}
export declare class QueryRef extends BaseExpression {
    query: QueryIR;
    alias: string;
    type: "queryRef";
    constructor(query: QueryIR, alias: string);
}
export declare class PropRef<T = any> extends BaseExpression<T> {
    path: Array<string>;
    type: "ref";
    constructor(path: Array<string>);
}
export declare class Value<T = any> extends BaseExpression<T> {
    value: T;
    type: "val";
    constructor(value: T);
}
export declare class Func<T = any> extends BaseExpression<T> {
    name: string;
    args: Array<BasicExpression>;
    type: "func";
    constructor(name: string, // such as eq, gt, lt, upper, lower, etc.
    args: Array<BasicExpression>);
}
export type BasicExpression<T = any> = PropRef<T> | Value<T> | Func<T>;
export declare class Aggregate<T = any> extends BaseExpression<T> {
    name: string;
    args: Array<BasicExpression>;
    type: "agg";
    constructor(name: string, // such as count, avg, sum, min, max, etc.
    args: Array<BasicExpression>);
}
/**
 * Runtime helper to detect IR expression-like objects.
 * Prefer this over ad-hoc local implementations to keep behavior consistent.
 */
export declare function isExpressionLike(value: any): boolean;
/**
 * Helper functions for working with Where clauses
 */
/**
 * Extract the expression from a Where clause
 */
export declare function getWhereExpression(where: Where): BasicExpression<boolean>;
/**
 * Extract the expression from a HAVING clause
 * HAVING clauses can contain aggregates, unlike regular WHERE clauses
 */
export declare function getHavingExpression(having: Having): BasicExpression | Aggregate;
/**
 * Check if a Where clause is marked as residual
 */
export declare function isResidualWhere(where: Where): boolean;
/**
 * Create a residual Where clause from an expression
 */
export declare function createResidualWhere(expression: BasicExpression<boolean>): Where;
/**
 * Follows the given reference in a query
 * until its finds the root field the reference points to.
 * @returns The collection, its alias, and the path to the root field in this collection
 */
export declare function followRef(query: QueryIR, ref: PropRef<any>, collection: Collection): {
    collection: Collection;
    path: Array<string>;
} | void;
export {};
