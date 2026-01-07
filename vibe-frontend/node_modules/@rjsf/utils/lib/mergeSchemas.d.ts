import { GenericObjectType } from './types.js';
/** Recursively merge deeply nested schemas. The difference between `mergeSchemas` and `mergeObjects` is that
 * `mergeSchemas` only concats arrays for values under the 'required' keyword, and when it does, it doesn't include
 * duplicate values.
 *
 * @param obj1 - The first schema object to merge
 * @param obj2 - The second schema object to merge
 * @returns - The merged schema object
 */
export default function mergeSchemas(obj1: GenericObjectType, obj2: GenericObjectType): GenericObjectType;
