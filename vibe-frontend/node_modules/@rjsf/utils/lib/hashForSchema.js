/** Hashes a string using the algorithm based on Java's hashing function.
 * JS has no built-in hashing function, so rolling our own
 *  based on Java's hashing fn:
 *  http://www.java2s.com/example/nodejs-utility-method/string-hash/hashcode-4dc2b.html
 *
 * @param string - The string for which to get the hash
 * @returns - The resulting hash of the string in hex format
 */
export function hashString(string) {
    let hash = 0;
    for (let i = 0; i < string.length; i += 1) {
        const chr = string.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}
/** Stringifies an `object`, sorts object fields in consistent order before stringifying it.
 *
 * @param object - The object for which the sorted stringify is desired
 * @returns - The stringified object with keys sorted in a consistent order
 */
export function sortedJSONStringify(object) {
    const allKeys = new Set();
    // solution source: https://stackoverflow.com/questions/16167581/sort-object-properties-and-json-stringify/53593328#53593328
    JSON.stringify(object, (key, value) => (allKeys.add(key), value));
    return JSON.stringify(object, Array.from(allKeys).sort());
}
/** Stringifies an `object` and returns the hash of the resulting string. Sorts object fields
 * in consistent order before stringify to prevent different hash ids for the same object.
 *
 * @param object - The object for which the hash is desired
 * @returns - The string obtained from the hash of the stringified object
 */
export function hashObject(object) {
    return hashString(sortedJSONStringify(object));
}
/** Stringifies the schema and returns the hash of the resulting string. Sorts schema fields
 * in consistent order before stringify to prevent different hash ids for the same schema.
 *
 * @param schema - The schema for which the hash is desired
 * @returns - The string obtained from the hash of the stringified schema
 */
export default function hashForSchema(schema) {
    return hashObject(schema);
}
//# sourceMappingURL=hashForSchema.js.map