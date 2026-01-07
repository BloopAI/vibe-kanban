import { GenericObjectType } from './types.js';
/** Recursively merge deeply nested objects.
 *
 * @param obj1 - The first object to merge
 * @param obj2 - The second object to merge
 * @param [concatArrays=false] - Optional flag that, when true, will cause arrays to be concatenated. Use
 *          "preventDuplicates" to merge arrays in a manner that prevents any duplicate entries from being merged.
 *          NOTE: Uses shallow comparison for the duplicate checking.
 * @returns - A new object that is the merge of the two given objects
 */
export default function mergeObjects(obj1: GenericObjectType, obj2: GenericObjectType, concatArrays?: boolean | 'preventDuplicates'): GenericObjectType;
