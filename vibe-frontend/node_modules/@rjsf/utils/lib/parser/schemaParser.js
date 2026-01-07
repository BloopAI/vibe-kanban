import forEach from 'lodash-es/forEach.js';
import { ITEMS_KEY, PROPERTIES_KEY } from '../constants.js';
import ParserValidator from './ParserValidator.js';
import { resolveAnyOrOneOfSchemas, retrieveSchemaInternal } from '../schema/retrieveSchema.js';
import deepEquals from '../deepEquals.js';
/** Recursive function used to parse the given `schema` belonging to the `rootSchema`. The `validator` is used to
 * capture the sub-schemas that the `isValid()` function is called with. For each schema returned by the
 * `retrieveSchemaInternal()`, the `resolveAnyOrOneOfSchemas()` function is called. For each of the schemas returned
 * from THAT call have `properties`, then each of the sub-schema property objects are then recursively parsed.
 *
 * @param validator - The `ParserValidator` implementation used to capture `isValid()` calls during parsing
 * @param recurseList - The list of schemas returned from the `retrieveSchemaInternal`, preventing infinite recursion
 * @param rootSchema - The root schema from which the schema parsing began
 * @param schema - The current schema element being parsed
 */
function parseSchema(validator, recurseList, rootSchema, schema) {
    const schemas = retrieveSchemaInternal(validator, schema, rootSchema, undefined, true);
    schemas.forEach((schema) => {
        const sameSchemaIndex = recurseList.findIndex((item) => deepEquals(item, schema));
        if (sameSchemaIndex === -1) {
            recurseList.push(schema);
            const allOptions = resolveAnyOrOneOfSchemas(validator, schema, rootSchema, true);
            allOptions.forEach((s) => {
                if (PROPERTIES_KEY in s && s[PROPERTIES_KEY]) {
                    forEach(schema[PROPERTIES_KEY], (value) => {
                        parseSchema(validator, recurseList, rootSchema, value);
                    });
                }
            });
            if (ITEMS_KEY in schema && !Array.isArray(schema.items) && typeof schema.items !== 'boolean') {
                parseSchema(validator, recurseList, rootSchema, schema.items);
            }
        }
    });
}
/** Parses the given `rootSchema` to extract out all the sub-schemas that maybe contained within it. Returns a map of
 * the hash of the schema to schema/sub-schema.
 *
 * @param rootSchema - The root schema to parse for sub-schemas used by `isValid()` calls
 * @returns - The `SchemaMap` of all schemas that were parsed
 */
export default function schemaParser(rootSchema) {
    const validator = new ParserValidator(rootSchema);
    const recurseList = [];
    parseSchema(validator, recurseList, rootSchema, rootSchema);
    return validator.getSchemaMap();
}
//# sourceMappingURL=schemaParser.js.map