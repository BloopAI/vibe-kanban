import { CONST_KEY } from './constants.js';
/** This function checks if the given `schema` matches a single constant value. This happens when either the schema has
 * an `enum` array with a single value or there is a `const` defined.
 *
 * @param schema - The schema for a field
 * @returns - True if the `schema` has a single constant value, false otherwise
 */
export default function isConstant(schema) {
    return (Array.isArray(schema.enum) && schema.enum.length === 1) || CONST_KEY in schema;
}
//# sourceMappingURL=isConstant.js.map