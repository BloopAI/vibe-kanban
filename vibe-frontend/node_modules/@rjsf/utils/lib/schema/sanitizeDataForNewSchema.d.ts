import { Experimental_CustomMergeAllOf, FormContextType, RJSFSchema, StrictRJSFSchema, ValidatorType } from '../types.js';
/** Sanitize the `data` associated with the `oldSchema` so it is considered appropriate for the `newSchema`. If the new
 * schema does not contain any properties, then `undefined` is returned to clear all the form data. Due to the nature
 * of schemas, this sanitization happens recursively for nested objects of data. Also, any properties in the old schema
 * that are non-existent in the new schema are set to `undefined`. The data sanitization process has the following flow:
 *
 * - If the new schema is an object that contains a `properties` object then:
 *   - Create a `removeOldSchemaData` object, setting each key in the `oldSchema.properties` having `data` to undefined
 *   - Create an empty `nestedData` object for use in the key filtering below:
 *   - Iterate over each key in the `newSchema.properties` as follows:
 *     - Get the `formValue` of the key from the `data`
 *     - Get the `oldKeySchema` and `newKeyedSchema` for the key, defaulting to `{}` when it doesn't exist
 *     - Retrieve the schema for any refs within each `oldKeySchema` and/or `newKeySchema`
 *     - Get the types of the old and new keyed schemas and if the old doesn't exist or the old & new are the same then:
 *       - If `removeOldSchemaData` has an entry for the key, delete it since the new schema has the same property
 *       - If type of the key in the new schema is `object`:
 *         - Store the value from the recursive `sanitizeDataForNewSchema` call in `nestedData[key]`
 *       - Otherwise, check for default or const values:
 *         - Get the old and new `default` values from the schema and check:
 *           - If the new `default` value does not match the form value:
 *             - If the old `default` value DOES match the form value, then:
 *               - Replace `removeOldSchemaData[key]` with the new `default`
 *               - Otherwise, if the new schema is `readOnly` then replace `removeOldSchemaData[key]` with undefined
 *         - Get the old and new `const` values from the schema and check:
 *           - If the new `const` value does not match the form value:
 *           - If the old `const` value DOES match the form value, then:
 *             - Replace `removeOldSchemaData[key]` with the new `const`
 *             - Otherwise, replace `removeOldSchemaData[key]` with undefined
 *   - Once all keys have been processed, return an object built as follows:
 *     - `{ ...removeOldSchemaData, ...nestedData, ...pick(data, keysToKeep) }`
 * - If the new and old schema types are array and the `data` is an array then:
 *   - If the type of the old and new schema `items` are a non-array objects:
 *     - Retrieve the schema for any refs within each `oldKeySchema.items` and/or `newKeySchema.items`
 *     - If the `type`s of both items are the same (or the old does not have a type):
 *       - If the type is "object", then:
 *         - For each element in the `data` recursively sanitize the data, stopping at `maxItems` if specified
 *       - Otherwise, just return the `data` removing any values after `maxItems` if it is set
 *   - If the type of the old and new schema `items` are booleans of the same value, return `data` as is
 * - Otherwise return `undefined`
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param rootSchema - The root JSON schema of the entire form
 * @param [newSchema] - The new schema for which the data is being sanitized
 * @param [oldSchema] - The old schema from which the data originated
 * @param [data={}] - The form data associated with the schema, defaulting to an empty object when undefined
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The new form data, with all the fields uniquely associated with the old schema set
 *      to `undefined`. Will return `undefined` if the new schema is not an object containing properties.
 */
export default function sanitizeDataForNewSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, rootSchema: S, newSchema?: S, oldSchema?: S, data?: any, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): T;
