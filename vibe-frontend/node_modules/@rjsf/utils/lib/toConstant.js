import { CONST_KEY, ENUM_KEY } from './constants.js';
/** Returns the constant value from the schema when it is either a single value enum or has a const key. Otherwise
 * throws an error.
 *
 * @param schema - The schema from which to obtain the constant value
 * @returns - The constant value for the schema
 * @throws - Error when the schema does not have a constant value
 */
export default function toConstant(schema) {
    if (ENUM_KEY in schema && Array.isArray(schema.enum) && schema.enum.length === 1) {
        return schema.enum[0];
    }
    if (CONST_KEY in schema) {
        return schema.const;
    }
    throw new Error('schema cannot be inferred as a constant');
}
//# sourceMappingURL=toConstant.js.map