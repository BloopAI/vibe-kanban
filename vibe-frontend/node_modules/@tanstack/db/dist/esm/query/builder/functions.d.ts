import { Aggregate, BasicExpression } from '../ir.js';
import { RefProxy } from './ref-proxy.js';
import { RefLeaf } from './types.js';
type StringRef = RefLeaf<string> | RefLeaf<string | null> | RefLeaf<string | undefined>;
type StringRefProxy = RefProxy<string> | RefProxy<string | null> | RefProxy<string | undefined>;
type StringBasicExpression = BasicExpression<string> | BasicExpression<string | null> | BasicExpression<string | undefined>;
type StringLike = StringRef | StringRefProxy | StringBasicExpression | string | null | undefined;
type ComparisonOperand<T> = RefProxy<T> | RefLeaf<T> | T | BasicExpression<T> | undefined | null;
type ComparisonOperandPrimitive<T extends string | number | boolean> = T | BasicExpression<T> | undefined | null;
type ExpressionLike = BasicExpression | RefProxy<any> | RefLeaf<any> | any;
type ExtractType<T> = T extends RefProxy<infer U> ? U : T extends RefLeaf<infer U> ? U : T extends BasicExpression<infer U> ? U : T;
type AggregateReturnType<T> = ExtractType<T> extends infer U ? U extends number | undefined | null | Date | bigint ? Aggregate<U> : Aggregate<number | undefined | null | Date | bigint> : Aggregate<number | undefined | null | Date | bigint>;
type StringFunctionReturnType<T> = ExtractType<T> extends infer U ? U extends string | undefined | null ? BasicExpression<U> : BasicExpression<string | undefined | null> : BasicExpression<string | undefined | null>;
type NumericFunctionReturnType<T> = ExtractType<T> extends infer U ? U extends string | Array<any> | undefined | null | number ? BasicExpression<MapToNumber<U>> : BasicExpression<number | undefined | null> : BasicExpression<number | undefined | null>;
type MapToNumber<T> = T extends string | Array<any> ? number : T extends undefined ? undefined : T extends null ? null : T;
type BinaryNumericReturnType<T1, T2> = ExtractType<T1> extends infer U1 ? ExtractType<T2> extends infer U2 ? U1 extends number ? U2 extends number ? BasicExpression<number> : U2 extends number | undefined ? BasicExpression<number | undefined> : U2 extends number | null ? BasicExpression<number | null> : BasicExpression<number | undefined | null> : U1 extends number | undefined ? U2 extends number ? BasicExpression<number | undefined> : U2 extends number | undefined ? BasicExpression<number | undefined> : BasicExpression<number | undefined | null> : U1 extends number | null ? U2 extends number ? BasicExpression<number | null> : BasicExpression<number | undefined | null> : BasicExpression<number | undefined | null> : BasicExpression<number | undefined | null> : BasicExpression<number | undefined | null>;
export declare function eq<T>(left: ComparisonOperand<T>, right: ComparisonOperand<T>): BasicExpression<boolean>;
export declare function eq<T extends string | number | boolean>(left: ComparisonOperandPrimitive<T>, right: ComparisonOperandPrimitive<T>): BasicExpression<boolean>;
export declare function eq<T>(left: Aggregate<T>, right: any): BasicExpression<boolean>;
export declare function gt<T>(left: ComparisonOperand<T>, right: ComparisonOperand<T>): BasicExpression<boolean>;
export declare function gt<T extends string | number>(left: ComparisonOperandPrimitive<T>, right: ComparisonOperandPrimitive<T>): BasicExpression<boolean>;
export declare function gt<T>(left: Aggregate<T>, right: any): BasicExpression<boolean>;
export declare function gte<T>(left: ComparisonOperand<T>, right: ComparisonOperand<T>): BasicExpression<boolean>;
export declare function gte<T extends string | number>(left: ComparisonOperandPrimitive<T>, right: ComparisonOperandPrimitive<T>): BasicExpression<boolean>;
export declare function gte<T>(left: Aggregate<T>, right: any): BasicExpression<boolean>;
export declare function lt<T>(left: ComparisonOperand<T>, right: ComparisonOperand<T>): BasicExpression<boolean>;
export declare function lt<T extends string | number>(left: ComparisonOperandPrimitive<T>, right: ComparisonOperandPrimitive<T>): BasicExpression<boolean>;
export declare function lt<T>(left: Aggregate<T>, right: any): BasicExpression<boolean>;
export declare function lte<T>(left: ComparisonOperand<T>, right: ComparisonOperand<T>): BasicExpression<boolean>;
export declare function lte<T extends string | number>(left: ComparisonOperandPrimitive<T>, right: ComparisonOperandPrimitive<T>): BasicExpression<boolean>;
export declare function lte<T>(left: Aggregate<T>, right: any): BasicExpression<boolean>;
export declare function and(left: ExpressionLike, right: ExpressionLike): BasicExpression<boolean>;
export declare function and(left: ExpressionLike, right: ExpressionLike, ...rest: Array<ExpressionLike>): BasicExpression<boolean>;
export declare function or(left: ExpressionLike, right: ExpressionLike): BasicExpression<boolean>;
export declare function or(left: ExpressionLike, right: ExpressionLike, ...rest: Array<ExpressionLike>): BasicExpression<boolean>;
export declare function not(value: ExpressionLike): BasicExpression<boolean>;
export declare function isUndefined(value: ExpressionLike): BasicExpression<boolean>;
export declare function isNull(value: ExpressionLike): BasicExpression<boolean>;
export declare function inArray(value: ExpressionLike, array: ExpressionLike): BasicExpression<boolean>;
export declare function like(left: StringLike, right: StringLike): BasicExpression<boolean>;
export declare function ilike(left: StringLike, right: StringLike): BasicExpression<boolean>;
export declare function upper<T extends ExpressionLike>(arg: T): StringFunctionReturnType<T>;
export declare function lower<T extends ExpressionLike>(arg: T): StringFunctionReturnType<T>;
export declare function length<T extends ExpressionLike>(arg: T): NumericFunctionReturnType<T>;
export declare function concat(...args: Array<ExpressionLike>): BasicExpression<string>;
export declare function coalesce(...args: Array<ExpressionLike>): BasicExpression<any>;
export declare function add<T1 extends ExpressionLike, T2 extends ExpressionLike>(left: T1, right: T2): BinaryNumericReturnType<T1, T2>;
export declare function count(arg: ExpressionLike): Aggregate<number>;
export declare function avg<T extends ExpressionLike>(arg: T): AggregateReturnType<T>;
export declare function sum<T extends ExpressionLike>(arg: T): AggregateReturnType<T>;
export declare function min<T extends ExpressionLike>(arg: T): AggregateReturnType<T>;
export declare function max<T extends ExpressionLike>(arg: T): AggregateReturnType<T>;
/**
 * List of comparison function names that can be used with indexes
 */
export declare const comparisonFunctions: readonly ["eq", "gt", "gte", "lt", "lte", "in", "like", "ilike"];
/**
 * All supported operator names in TanStack DB expressions
 */
export declare const operators: readonly ["eq", "gt", "gte", "lt", "lte", "in", "like", "ilike", "and", "or", "not", "isNull", "isUndefined", "upper", "lower", "length", "concat", "add", "coalesce", "count", "avg", "sum", "min", "max"];
export type OperatorName = (typeof operators)[number];
export {};
