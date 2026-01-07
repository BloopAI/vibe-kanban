import isConstant from '../isConstant.js';
import retrieveSchema from './retrieveSchema.js';
/** Checks to see if the `schema` combination represents a select
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param theSchema - The schema for which check for a select flag is desired
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - True if schema contains a select, otherwise false
 */
export default function isSelect(validator, theSchema, rootSchema = {}, experimental_customMergeAllOf) {
    const schema = retrieveSchema(validator, theSchema, rootSchema, undefined, experimental_customMergeAllOf);
    const altSchemas = schema.oneOf || schema.anyOf;
    if (Array.isArray(schema.enum)) {
        return true;
    }
    if (Array.isArray(altSchemas)) {
        return altSchemas.every((altSchemas) => typeof altSchemas !== 'boolean' && isConstant(altSchemas));
    }
    return false;
}
//# sourceMappingURL=isSelect.js.map