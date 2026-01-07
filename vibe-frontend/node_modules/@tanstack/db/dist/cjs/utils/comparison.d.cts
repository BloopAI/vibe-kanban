import { CompareOptions } from '../query/builder/types.cjs';
/**
 * Universal comparison function for all data types
 * Handles null/undefined, strings, arrays, dates, objects, and primitives
 * Always sorts null/undefined values first
 */
export declare const ascComparator: (a: any, b: any, opts: CompareOptions) => number;
/**
 * Descending comparator function for ordering values
 * Handles null/undefined as largest values (opposite of ascending)
 */
export declare const descComparator: (a: unknown, b: unknown, opts: CompareOptions) => number;
export declare function makeComparator(opts: CompareOptions): (a: any, b: any) => number;
/** Default comparator orders values in ascending order with nulls first and locale string comparison. */
export declare const defaultComparator: (a: any, b: any) => number;
/**
 * Normalize a value for comparison and Map key usage
 * Converts values that can't be directly compared or used as Map keys
 * into comparable primitive representations
 */
export declare function normalizeValue(value: any): any;
/**
 * Compare two values for equality, with special handling for Uint8Arrays and Buffers
 */
export declare function areValuesEqual(a: any, b: any): boolean;
