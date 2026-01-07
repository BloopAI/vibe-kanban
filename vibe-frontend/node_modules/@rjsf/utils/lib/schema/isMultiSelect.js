import isSelect from './isSelect.js';
/** Checks to see if the `schema` combination represents a multi-select
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which check for a multi-select flag is desired
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - True if schema contains a multi-select, otherwise false
 */
export default function isMultiSelect(validator, schema, rootSchema, experimental_customMergeAllOf) {
    if (!schema.uniqueItems || !schema.items || typeof schema.items === 'boolean') {
        return false;
    }
    return isSelect(validator, schema.items, rootSchema, experimental_customMergeAllOf);
}
//# sourceMappingURL=isMultiSelect.js.map