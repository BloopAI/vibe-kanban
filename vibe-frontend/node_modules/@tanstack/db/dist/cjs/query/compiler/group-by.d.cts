import { Aggregate, BasicExpression, GroupBy, Having, Select } from '../ir.js';
import { NamespacedAndKeyedStream } from '../../types.js';
/**
 * Processes the GROUP BY clause with optional HAVING and SELECT
 * Works with the new __select_results structure from early SELECT processing
 */
export declare function processGroupBy(pipeline: NamespacedAndKeyedStream, groupByClause: GroupBy, havingClauses?: Array<Having>, selectClause?: Select, fnHavingClauses?: Array<(row: any) => any>): NamespacedAndKeyedStream;
/**
 * Transforms basic expressions and aggregates to replace Agg expressions with references to computed values
 */
export declare function replaceAggregatesByRefs(havingExpr: BasicExpression | Aggregate, selectClause: Select, resultAlias?: string): BasicExpression;
