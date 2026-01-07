/** Implements a shallow equals comparison that uses Object.is() for comparing values.
 * This function compares objects by checking if all keys and their values are equal using Object.is().
 *
 * @param a - The first element to compare
 * @param b - The second element to compare
 * @returns - True if the `a` and `b` are shallow equal, false otherwise
 */
export default function shallowEquals(a: any, b: any): boolean {
  // If they're the same reference, they're equal
  if (Object.is(a, b)) {
    return true;
  }

  // If either is null or undefined, they're not equal (since we know they're not the same reference)
  if (a == null || b == null) {
    return false;
  }

  // If they're not objects, they're not equal (since Object.is already checked)
  if (typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  // Different number of keys means not equal
  if (keysA.length !== keysB.length) {
    return false;
  }

  // Check if all keys and values are equal
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
      return false;
    }
  }

  return true;
}
