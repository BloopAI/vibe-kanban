import { REF_KEY, ROOT_SCHEMA_PREFIX } from './constants.js';
import isObject from 'lodash-es/isObject.js';
/** Takes a `node` object and transforms any contained `$ref` node variables with a prefix, recursively calling
 * `withIdRefPrefix` for any other elements.
 *
 * @param node - The object node to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 */
function withIdRefPrefixObject(node) {
    for (const key in node) {
        const realObj = node;
        const value = realObj[key];
        if (key === REF_KEY && typeof value === 'string' && value.startsWith('#')) {
            realObj[key] = ROOT_SCHEMA_PREFIX + value;
        }
        else {
            realObj[key] = withIdRefPrefix(value);
        }
    }
    return node;
}
/** Takes a `node` object list and transforms any contained `$ref` node variables with a prefix, recursively calling
 * `withIdRefPrefix` for any other elements.
 *
 * @param node - The list of object nodes to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 */
function withIdRefPrefixArray(node) {
    for (let i = 0; i < node.length; i++) {
        node[i] = withIdRefPrefix(node[i]);
    }
    return node;
}
/** Recursively prefixes all `$ref`s in a schema with the value of the `ROOT_SCHEMA_PREFIX` constant.
 * This is used in isValid to make references to the rootSchema
 *
 * @param schemaNode - The object node to which a ROOT_SCHEMA_PREFIX is added when a REF_KEY is part of it
 * @returns - A copy of the `schemaNode` with updated `$ref`s
 */
export default function withIdRefPrefix(schemaNode) {
    if (Array.isArray(schemaNode)) {
        return withIdRefPrefixArray([...schemaNode]);
    }
    if (isObject(schemaNode)) {
        return withIdRefPrefixObject({ ...schemaNode });
    }
    return schemaNode;
}
//# sourceMappingURL=withIdRefPrefix.js.map