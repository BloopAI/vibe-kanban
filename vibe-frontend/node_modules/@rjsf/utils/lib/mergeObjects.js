import isObject from './isObject.js';
/** Recursively merge deeply nested objects.
 *
 * @param obj1 - The first object to merge
 * @param obj2 - The second object to merge
 * @param [concatArrays=false] - Optional flag that, when true, will cause arrays to be concatenated. Use
 *          "preventDuplicates" to merge arrays in a manner that prevents any duplicate entries from being merged.
 *          NOTE: Uses shallow comparison for the duplicate checking.
 * @returns - A new object that is the merge of the two given objects
 */
export default function mergeObjects(obj1, obj2, concatArrays = false) {
    return Object.keys(obj2).reduce((acc, key) => {
        const left = obj1 ? obj1[key] : {}, right = obj2[key];
        if (obj1 && key in obj1 && isObject(right)) {
            acc[key] = mergeObjects(left, right, concatArrays);
        }
        else if (concatArrays && Array.isArray(left) && Array.isArray(right)) {
            let toMerge = right;
            if (concatArrays === 'preventDuplicates') {
                toMerge = right.reduce((result, value) => {
                    if (!left.includes(value)) {
                        result.push(value);
                    }
                    return result;
                }, []);
            }
            acc[key] = left.concat(toMerge);
        }
        else {
            acc[key] = right;
        }
        return acc;
    }, Object.assign({}, obj1)); // Prevent mutation of source object.
}
//# sourceMappingURL=mergeObjects.js.map