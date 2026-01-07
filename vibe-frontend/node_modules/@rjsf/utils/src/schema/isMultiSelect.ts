import { FormContextType, RJSFSchema, StrictRJSFSchema, ValidatorType, Experimental_CustomMergeAllOf } from '../types';

import isSelect from './isSelect';

/** Checks to see if the `schema` combination represents a multi-select
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which check for a multi-select flag is desired
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - True if schema contains a multi-select, otherwise false
 */
export default function isMultiSelect<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema?: S,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
) {
  if (!schema.uniqueItems || !schema.items || typeof schema.items === 'boolean') {
    return false;
  }
  return isSelect<T, S, F>(validator, schema.items as S, rootSchema, experimental_customMergeAllOf);
}
