import keys from 'lodash-es/keys.js';
import pickBy from 'lodash-es/pickBy.js';
import isPlainObject from 'lodash-es/isPlainObject.js';
import get from 'lodash-es/get.js';
import difference from 'lodash-es/difference.js';
import deepEquals from './deepEquals.js';
/**
 * Compares two objects and returns the names of the fields that have changed.
 * This function iterates over each field of object `a`, using `_.isEqual` to compare the field value
 * with the corresponding field value in object `b`. If the values are different, the field name will
 * be included in the returned array.
 *
 * @param a - The first object, representing the original data to compare.
 * @param b - The second object, representing the updated data to compare.
 * @returns - An array of field names that have changed.
 *
 * @example
 * const a = { name: 'John', age: 30 };
 * const b = { name: 'John', age: 31 };
 * const changedFields = getChangedFields(a, b);
 * console.log(changedFields); // Output: ['age']
 */
export default function getChangedFields(a, b) {
    const aIsPlainObject = isPlainObject(a);
    const bIsPlainObject = isPlainObject(b);
    // If strictly equal or neither of them is a plainObject returns an empty array
    if (a === b || (!aIsPlainObject && !bIsPlainObject)) {
        return [];
    }
    if (aIsPlainObject && !bIsPlainObject) {
        return keys(a);
    }
    else if (!aIsPlainObject && bIsPlainObject) {
        return keys(b);
    }
    else {
        const unequalFields = keys(pickBy(a, (value, key) => !deepEquals(value, get(b, key))));
        const diffFields = difference(keys(b), keys(a));
        return [...unequalFields, ...diffFields];
    }
}
//# sourceMappingURL=getChangedFields.js.map