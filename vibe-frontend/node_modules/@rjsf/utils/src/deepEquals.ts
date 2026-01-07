import isEqualWith from 'lodash/isEqualWith';

/** Implements a deep equals using the `lodash.isEqualWith` function, that provides a customized comparator that
 * assumes all functions are equivalent.
 *
 * @param a - The first element to compare
 * @param b - The second element to compare
 * @returns - True if the `a` and `b` are deeply equal, false otherwise
 */
export default function deepEquals(a: any, b: any): boolean {
  return isEqualWith(a, b, (obj: any, other: any) => {
    if (typeof obj === 'function' && typeof other === 'function') {
      // Assume all functions are equivalent
      // see https://github.com/rjsf-team/react-jsonschema-form/issues/255
      return true;
    }
    return undefined; // fallback to default isEquals behavior
  });
}
