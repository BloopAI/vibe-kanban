/** Determines whether a `thing` is an object for the purposes of RJSF. In this case, `thing` is an object if it has
 * the type `object` but is NOT null, an array or a File.
 *
 * @param thing - The thing to check to see whether it is an object
 * @returns - True if it is a non-null, non-array, non-File object
 */
export default function isObject(thing: any): thing is object;
