import { Aggregate, BasicExpression, Select } from '../ir.js';
import { KeyedStream, NamespacedAndKeyedStream, NamespacedRow } from '../../types.js';
/**
 * Processes the SELECT clause and places results in __select_results
 * while preserving the original namespaced row for ORDER BY access
 */
export declare function processSelect(pipeline: NamespacedAndKeyedStream, select: Select, _allInputs: Record<string, KeyedStream>): NamespacedAndKeyedStream;
/**
 * Processes a single argument in a function context
 */
export declare function processArgument(arg: BasicExpression | Aggregate, namespacedRow: NamespacedRow): any;
