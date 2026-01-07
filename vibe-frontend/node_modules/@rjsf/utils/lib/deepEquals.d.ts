/** Implements a deep equals using the `lodash.isEqualWith` function, that provides a customized comparator that
 * assumes all functions are equivalent.
 *
 * @param a - The first element to compare
 * @param b - The second element to compare
 * @returns - True if the `a` and `b` are deeply equal, false otherwise
 */
export default function deepEquals(a: any, b: any): boolean;
