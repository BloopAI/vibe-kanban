/** Check to see if a `schema` specifies that a value must be true. This happens when:
 * - `schema.const` is truthy
 * - `schema.enum` == `[true]`
 * - `schema.anyOf` or `schema.oneOf` has a single value which recursively returns true
 * - `schema.allOf` has at least one value which recursively returns true
 *
 * @param schema - The schema to check
 * @returns - True if the schema specifies a value that must be true, false otherwise
 */
export default function schemaRequiresTrueValue(schema) {
    // Check if const is a truthy value
    if (schema.const) {
        return true;
    }
    // Check if an enum has a single value of true
    if (schema.enum && schema.enum.length === 1 && schema.enum[0] === true) {
        return true;
    }
    // If anyOf has a single value, evaluate the subschema
    if (schema.anyOf && schema.anyOf.length === 1) {
        return schemaRequiresTrueValue(schema.anyOf[0]);
    }
    // If oneOf has a single value, evaluate the subschema
    if (schema.oneOf && schema.oneOf.length === 1) {
        return schemaRequiresTrueValue(schema.oneOf[0]);
    }
    // Evaluate each subschema in allOf, to see if one of them requires a true value
    if (schema.allOf) {
        const schemaSome = (subSchema) => schemaRequiresTrueValue(subSchema);
        return schema.allOf.some(schemaSome);
    }
    return false;
}
//# sourceMappingURL=schemaRequiresTrueValue.js.map