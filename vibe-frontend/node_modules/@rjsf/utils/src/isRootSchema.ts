import isEqual from 'lodash/isEqual';

import { FormContextType, Registry, RJSFSchema, StrictRJSFSchema } from './types';
import { REF_KEY } from './constants';

/** Helper to check whether a JSON schema object is the root schema. The schema is a root schema with root `properties`
 * key or a root `$ref` key. If the `schemaToCompare` has a root `oneOf` property, the function will
 * return false. Else if `schemaToCompare` and `rootSchema` are the same object or equal, the function will return
 * `true`. Else if the `rootSchema` has a $ref, it will be resolved using `schemaUtils.resolveSchema` utility. If the
 * resolved schema matches the `schemaToCompare` the function will return `true`. Otherwise, it will return false.
 *
 * @param registry - The `Registry` used to get the `rootSchema` and `schemaUtils`
 * @param schemaToCompare - The JSON schema object to check. If `schemaToCompare` is an root schema, the
 *        function will return true.
 * @returns - Flag indicating whether the `schemaToCompare` is the root schema
 */
export default function isRootSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  registry: Registry<T, S, F>,
  schemaToCompare: S,
): boolean {
  const { rootSchema, schemaUtils } = registry;
  if (isEqual(schemaToCompare, rootSchema)) {
    return true;
  }
  if (REF_KEY in rootSchema) {
    const resolvedSchema = schemaUtils.retrieveSchema(rootSchema);
    return isEqual(schemaToCompare, resolvedSchema);
  }
  return false;
}
