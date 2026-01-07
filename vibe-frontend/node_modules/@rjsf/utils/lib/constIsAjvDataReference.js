import { CONST_KEY, getSchemaType, isObject } from './index.js';
import isString from 'lodash-es/isString.js';
/**
 * Checks if the schema const property value is an AJV $data reference
 * and the current schema is not an object or array
 *
 * @param schema - The schema to check if the const is an AJV $data reference
 * @returns - true if the schema const property value is an AJV $data reference otherwise false.
 */
export default function constIsAjvDataReference(schema) {
    const schemaConst = schema[CONST_KEY];
    const schemaType = getSchemaType(schema);
    return isObject(schemaConst) && isString(schemaConst === null || schemaConst === void 0 ? void 0 : schemaConst.$data) && schemaType !== 'object' && schemaType !== 'array';
}
//# sourceMappingURL=constIsAjvDataReference.js.map