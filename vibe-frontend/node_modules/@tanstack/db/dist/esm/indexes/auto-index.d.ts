import { CompareOptions } from '../query/builder/types.js';
import { BasicExpression } from '../query/ir.js';
import { CollectionImpl } from '../collection/index.js';
export interface AutoIndexConfig {
    autoIndex?: `off` | `eager`;
}
export declare function ensureIndexForField<T extends Record<string, any>, TKey extends string | number>(fieldName: string, fieldPath: Array<string>, collection: CollectionImpl<T, TKey, any, any, any>, compareOptions?: CompareOptions, compareFn?: (a: any, b: any) => number): void;
/**
 * Analyzes a where expression and creates indexes for all simple operations on single fields
 */
export declare function ensureIndexForExpression<T extends Record<string, any>, TKey extends string | number>(expression: BasicExpression, collection: CollectionImpl<T, TKey, any, any, any>): void;
