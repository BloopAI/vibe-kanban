import { CompareOptions } from '../builder/types.js';
import { WindowOptions } from './types.js';
import { OrderBy, OrderByClause, QueryIR, Select } from '../ir.js';
import { CollectionLike, NamespacedAndKeyedStream, NamespacedRow } from '../../types.js';
import { IStreamBuilder, KeyValue } from '@tanstack/db-ivm';
import { IndexInterface } from '../../indexes/base-index.js';
import { Collection } from '../../collection/index.js';
export type OrderByOptimizationInfo = {
    alias: string;
    orderBy: OrderBy;
    offset: number;
    limit: number;
    comparator: (a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined) => number;
    /** Extracts all orderBy column values from a raw row (array for multi-column) */
    valueExtractorForRawRow: (row: Record<string, unknown>) => unknown;
    /** Extracts only the first column value - used for index-based cursor */
    firstColumnValueExtractor: (row: Record<string, unknown>) => unknown;
    /** Index on the first orderBy column - used for lazy loading */
    index?: IndexInterface<string | number>;
    dataNeeded?: () => number;
};
/**
 * Processes the ORDER BY clause
 * Works with the new structure that has both namespaced row data and __select_results
 * Always uses fractional indexing and adds the index as __ordering_index to the result
 */
export declare function processOrderBy(rawQuery: QueryIR, pipeline: NamespacedAndKeyedStream, orderByClause: Array<OrderByClause>, selectClause: Select, collection: Collection, optimizableOrderByCollections: Record<string, OrderByOptimizationInfo>, setWindowFn: (windowFn: (options: WindowOptions) => void) => void, limit?: number, offset?: number): IStreamBuilder<KeyValue<unknown, [NamespacedRow, string]>>;
/**
 * Builds a comparison configuration object that uses the values provided in the orderBy clause.
 * If no string sort configuration is provided it defaults to the collection's string sort configuration.
 */
export declare function buildCompareOptions(clause: OrderByClause, collection: CollectionLike<any, any>): CompareOptions;
