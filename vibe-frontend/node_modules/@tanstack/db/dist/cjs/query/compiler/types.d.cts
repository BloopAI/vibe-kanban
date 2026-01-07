import { QueryIR } from '../ir.js';
import { CompilationResult } from './index.js';
/**
 * Cache for compiled subqueries to avoid duplicate compilation
 */
export type QueryCache = WeakMap<QueryIR, CompilationResult>;
/**
 * Mapping from optimized queries back to their original queries for caching
 */
export type QueryMapping = WeakMap<QueryIR, QueryIR>;
export type WindowOptions = {
    offset?: number;
    limit?: number;
};
