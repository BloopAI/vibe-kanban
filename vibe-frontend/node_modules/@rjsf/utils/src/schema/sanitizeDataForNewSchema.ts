import get from 'lodash/get';
import has from 'lodash/has';

import {
  Experimental_CustomMergeAllOf,
  FormContextType,
  GenericObjectType,
  RJSFSchema,
  StrictRJSFSchema,
  ValidatorType,
} from '../types';
import { PROPERTIES_KEY, REF_KEY } from '../constants';
import retrieveSchema from './retrieveSchema';

const NO_VALUE = Symbol('no Value');

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
export default function sanitizeDataForNewSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  newSchema?: S,
  oldSchema?: S,
  data: any = {},
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): T {
  // By default, we will clear the form data
  let newFormData;
  // If the new schema is of type object and that object contains a list of properties
  if (has(newSchema, PROPERTIES_KEY)) {
    // Create an object containing root-level keys in the old schema, setting each key to undefined to remove the data
    const removeOldSchemaData: GenericObjectType = {};
    if (has(oldSchema, PROPERTIES_KEY)) {
      const properties = get(oldSchema, PROPERTIES_KEY, {});
      Object.keys(properties).forEach((key) => {
        if (has(data, key)) {
          removeOldSchemaData[key] = undefined;
        }
      });
    }
    const keys: string[] = Object.keys(get(newSchema, PROPERTIES_KEY, {}));
    // Create a place to store nested data that will be a side-effect of the filter
    const nestedData: GenericObjectType = {};
    keys.forEach((key) => {
      const formValue = get(data, key);
      let oldKeyedSchema: S = get(oldSchema, [PROPERTIES_KEY, key], {}) as S;
      let newKeyedSchema: S = get(newSchema, [PROPERTIES_KEY, key], {}) as S;
      // Resolve the refs if they exist
      if (has(oldKeyedSchema, REF_KEY)) {
        oldKeyedSchema = retrieveSchema<T, S, F>(
          validator,
          oldKeyedSchema,
          rootSchema,
          formValue,
          experimental_customMergeAllOf,
        );
      }
      if (has(newKeyedSchema, REF_KEY)) {
        newKeyedSchema = retrieveSchema<T, S, F>(
          validator,
          newKeyedSchema,
          rootSchema,
          formValue,
          experimental_customMergeAllOf,
        );
      }
      // Now get types and see if they are the same
      const oldSchemaTypeForKey = get(oldKeyedSchema, 'type');
      const newSchemaTypeForKey = get(newKeyedSchema, 'type');
      // Check if the old option has the same key with the same type
      if (!oldSchemaTypeForKey || oldSchemaTypeForKey === newSchemaTypeForKey) {
        if (has(removeOldSchemaData, key)) {
          // SIDE-EFFECT: remove the undefined value for a key that has the same type between the old and new schemas
          delete removeOldSchemaData[key];
        }
        // If it is an object, we'll recurse and store the resulting sanitized data for the key
        if (newSchemaTypeForKey === 'object' || (newSchemaTypeForKey === 'array' && Array.isArray(formValue))) {
          // SIDE-EFFECT: process the new schema type of object recursively to save iterations
          const itemData = sanitizeDataForNewSchema<T, S, F>(
            validator,
            rootSchema,
            newKeyedSchema,
            oldKeyedSchema,
            formValue,
            experimental_customMergeAllOf,
          );
          if (itemData !== undefined || newSchemaTypeForKey === 'array') {
            // only put undefined values for the array type and not the object type
            nestedData[key] = itemData;
          }
        } else {
          // Ok, the non-object types match, let's make sure that a default or a const of a different value is replaced
          // with the new default or const. This allows the case where two schemas differ that only by the default/const
          // value to be properly selected
          const newOptionDefault = get(newKeyedSchema, 'default', NO_VALUE);
          const oldOptionDefault = get(oldKeyedSchema, 'default', NO_VALUE);
          if (newOptionDefault !== NO_VALUE && newOptionDefault !== formValue) {
            if (oldOptionDefault === formValue) {
              // If the old default matches the formValue, we'll update the new value to match the new default
              removeOldSchemaData[key] = newOptionDefault;
            } else if (get(newKeyedSchema, 'readOnly') === true) {
              // If the new schema has the default set to read-only, treat it like a const and remove the value
              removeOldSchemaData[key] = undefined;
            }
          }

          const newOptionConst = get(newKeyedSchema, 'const', NO_VALUE);
          const oldOptionConst = get(oldKeyedSchema, 'const', NO_VALUE);
          if (newOptionConst !== NO_VALUE && newOptionConst !== formValue) {
            // Since this is a const, if the old value matches, replace the value with the new const otherwise clear it
            removeOldSchemaData[key] = oldOptionConst === formValue ? newOptionConst : undefined;
          }
        }
      }
    });

    newFormData = {
      ...(typeof data == 'string' || Array.isArray(data) ? undefined : data),
      ...removeOldSchemaData,
      ...nestedData,
    };
    // First apply removing the old schema data, then apply the nested data, then apply the old data keys to keep
  } else if (get(oldSchema, 'type') === 'array' && get(newSchema, 'type') === 'array' && Array.isArray(data)) {
    let oldSchemaItems = get(oldSchema, 'items');
    let newSchemaItems = get(newSchema, 'items');
    // If any of the array types `items` are arrays (remember arrays are objects) then we'll just drop the data
    // Eventually, we may want to deal with when either of the `items` are arrays since those tuple validations
    if (
      typeof oldSchemaItems === 'object' &&
      typeof newSchemaItems === 'object' &&
      !Array.isArray(oldSchemaItems) &&
      !Array.isArray(newSchemaItems)
    ) {
      if (has(oldSchemaItems, REF_KEY)) {
        oldSchemaItems = retrieveSchema<T, S, F>(
          validator,
          oldSchemaItems as S,
          rootSchema,
          data as T,
          experimental_customMergeAllOf,
        );
      }
      if (has(newSchemaItems, REF_KEY)) {
        newSchemaItems = retrieveSchema<T, S, F>(
          validator,
          newSchemaItems as S,
          rootSchema,
          data as T,
          experimental_customMergeAllOf,
        );
      }
      // Now get types and see if they are the same
      const oldSchemaType = get(oldSchemaItems, 'type');
      const newSchemaType = get(newSchemaItems, 'type');
      // Check if the old option has the same key with the same type
      if (!oldSchemaType || oldSchemaType === newSchemaType) {
        const maxItems = get(newSchema, 'maxItems', -1);
        if (newSchemaType === 'object') {
          newFormData = data.reduce((newValue, aValue) => {
            const itemValue = sanitizeDataForNewSchema<T, S, F>(
              validator,
              rootSchema,
              newSchemaItems as S,
              oldSchemaItems as S,
              aValue,
              experimental_customMergeAllOf,
            );
            if (itemValue !== undefined && (maxItems < 0 || newValue.length < maxItems)) {
              newValue.push(itemValue);
            }
            return newValue;
          }, []);
        } else {
          newFormData = maxItems > 0 && data.length > maxItems ? data.slice(0, maxItems) : data;
        }
      }
    } else if (
      typeof oldSchemaItems === 'boolean' &&
      typeof newSchemaItems === 'boolean' &&
      oldSchemaItems === newSchemaItems
    ) {
      // If they are both booleans and have the same value just return the data as is otherwise fall-thru to undefined
      newFormData = data;
    }
    // Also probably want to deal with `prefixItems` as tuples with the latest 2020 draft
  }
  return newFormData as T;
}
