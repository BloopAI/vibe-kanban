/** Implements a shallow equals comparison that uses Object.is() for comparing values.
 * This function compares objects by checking if all keys and their values are equal using Object.is().
 *
 * @param a - The first element to compare
 * @param b - The second element to compare
 * @returns - True if the `a` and `b` are shallow equal, false otherwise
 */
export default function shallowEquals(a: any, b: any): boolean;
