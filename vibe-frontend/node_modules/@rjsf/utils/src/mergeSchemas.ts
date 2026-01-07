import union from 'lodash/union';

import { REQUIRED_KEY } from './constants';
import getSchemaType from './getSchemaType';
import isObject from './isObject';
import { GenericObjectType } from './types';

/** Recursively merge deeply nested schemas. The difference between `mergeSchemas` and `mergeObjects` is that
 * `mergeSchemas` only concats arrays for values under the 'required' keyword, and when it does, it doesn't include
 * duplicate values.
 *
 * @param obj1 - The first schema object to merge
 * @param obj2 - The second schema object to merge
 * @returns - The merged schema object
 */
export default function mergeSchemas(obj1: GenericObjectType, obj2: GenericObjectType) {
  const acc = Object.assign({}, obj1); // Prevent mutation of source object.
  return Object.keys(obj2).reduce((acc, key) => {
    const left = obj1 ? obj1[key] : {},
      right = obj2[key];
    if (obj1 && key in obj1 && isObject(right)) {
      acc[key] = mergeSchemas(left, right);
    } else if (
      obj1 &&
      obj2 &&
      (getSchemaType(obj1) === 'object' || getSchemaType(obj2) === 'object') &&
      key === REQUIRED_KEY &&
      Array.isArray(left) &&
      Array.isArray(right)
    ) {
      // Don't include duplicate values when merging 'required' fields.
      acc[key] = union(left, right);
    } else {
      acc[key] = right;
    }
    return acc;
  }, acc);
}
