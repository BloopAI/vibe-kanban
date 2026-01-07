import get from 'lodash/get';
import has from 'lodash/has';
import isEmpty from 'lodash/isEmpty';

import retrieveSchema from './retrieveSchema';
import { Experimental_CustomMergeAllOf, FormContextType, RJSFSchema, StrictRJSFSchema, ValidatorType } from '../types';
import { REF_KEY } from '../constants';

/** Internal helper function that acts like lodash's `get` but additionally retrieves `$ref`s as needed to get the path
 * for schemas containing potentially nested `$ref`s.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param schema - The current node within the JSON schema recursion
 * @param path - The remaining keys in the path to the desired property
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The internal schema from the `schema` for the given `path` or undefined if not found
 */
function getFromSchemaInternal<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  schema: S,
  path: string | string[],
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): T | S | undefined {
  let fieldSchema = schema;
  if (has(schema, REF_KEY)) {
    fieldSchema = retrieveSchema<T, S, F>(validator, schema, rootSchema, undefined, experimental_customMergeAllOf);
  }
  if (isEmpty(path)) {
    return fieldSchema;
  }
  const pathList = Array.isArray(path) ? path : path.split('.');
  const [part, ...nestedPath] = pathList;
  if (part && has(fieldSchema, part)) {
    fieldSchema = get(fieldSchema, part) as S;
    return getFromSchemaInternal<T, S, F>(
      validator,
      rootSchema,
      fieldSchema,
      nestedPath,
      experimental_customMergeAllOf,
    );
  }
  return undefined;
}

/** Helper that acts like lodash's `get` but additionally retrieves `$ref`s as needed to get the path for schemas
 * containing potentially nested `$ref`s.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param schema - The current node within the JSON schema recursion
 * @param path - The keys in the path to the desired field
 * @param defaultValue - The value to return if a value is not found for the `pathList` path
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The inner schema from the `schema` for the given `path` or the `defaultValue` if not found
 */
export default function getFromSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  schema: S,
  path: string | string[],
  defaultValue: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): T;
export default function getFromSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  schema: S,
  path: string | string[],
  defaultValue: S,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S;
export default function getFromSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  schema: S,
  path: string | string[],
  defaultValue: T | S,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): T | S {
  const result = getFromSchemaInternal(validator, rootSchema, schema, path, experimental_customMergeAllOf);
  if (result === undefined) {
    return defaultValue;
  }
  return result;
}
