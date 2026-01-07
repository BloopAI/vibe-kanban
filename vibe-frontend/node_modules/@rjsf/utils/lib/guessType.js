/** Given a specific `value` attempts to guess the type of a schema element. In the case where we have to implicitly
 *  create a schema, it is useful to know what type to use based on the data we are defining.
 *
 * @param value - The value from which to guess the type
 * @returns - The best guess for the object type
 */
export default function guessType(value) {
    if (Array.isArray(value)) {
        return 'array';
    }
    if (typeof value === 'string') {
        return 'string';
    }
    if (value == null) {
        return 'null';
    }
    if (typeof value === 'boolean') {
        return 'boolean';
    }
    if (!isNaN(value)) {
        return 'number';
    }
    if (typeof value === 'object') {
        return 'object';
    }
    // Default to string if we can't figure it out
    return 'string';
}
//# sourceMappingURL=guessType.js.map