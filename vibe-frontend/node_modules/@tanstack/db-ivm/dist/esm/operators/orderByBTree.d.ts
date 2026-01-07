import { KeyValue } from '../types.js';
import { OrderByOptions } from './orderBy.js';
export declare function orderByWithFractionalIndexBTree<T extends KeyValue<unknown, unknown>, Ve = unknown>(valueExtractor: (value: T extends KeyValue<unknown, infer V> ? V : never) => Ve, options?: OrderByOptions<Ve>): (stream: import('../types.js').IStreamBuilder<T>) => import('../types.js').IStreamBuilder<[T extends KeyValue<infer K, unknown> ? K : never, [T extends KeyValue<unknown, infer V> ? V : never, string]]>;
