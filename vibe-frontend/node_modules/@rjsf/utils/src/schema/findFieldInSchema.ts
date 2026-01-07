import get from 'lodash/get';
import has from 'lodash/has';

import findSelectedOptionInXxxOf from './findSelectedOptionInXxxOf';
import getFromSchema from './getFromSchema';
import { ANY_OF_KEY, ONE_OF_KEY, PROPERTIES_KEY, REQUIRED_KEY } from '../constants';
import {
  Experimental_CustomMergeAllOf,
  FormContextType,
  FoundFieldType,
  RJSFSchema,
  StrictRJSFSchema,
  ValidatorType,
} from '../types';

/** Unique schema that represents no schema was found, exported for testing purposes */
export const NOT_FOUND_SCHEMA = { title: '!@#$_UNKNOWN_$#@!' };

/** Finds the field specified by the `path` within the root or recursed `schema`. If there is no field for the specified
 * `path`, then the default `{ field: undefined, isRequired: undefined }` is returned. It determines whether a leaf
 * field is in the `required` list for its parent and if so, it is marked as required on return.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param schema - The node within the JSON schema in which to search
 * @param path - The keys in the path to the desired field
 * @param [formData={}] - The form data that is used to determine which anyOf/oneOf option to descend
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - An object that contains the field and its required state. If no field can be found then
 *            `{ field: undefined, isRequired: undefined }` is returned.
 */
export default function findFieldInSchema<
  T = undefined,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  schema: S,
  path: string | string[],
  formData: T = {} as T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): FoundFieldType<S> {
  const pathList = Array.isArray(path) ? [...path] : path.split('.');
  let parentField = schema;

  // store the desired field into a variable and removing it from the `pathList`
  const fieldName = pathList.pop()!;

  if (pathList.length) {
    // drilling into the schema for each sub-path and taking into account of the any/oneOfs
    pathList.forEach((subPath) => {
      parentField = getFromSchema<T, S, F>(
        validator,
        rootSchema,
        parentField,
        [PROPERTIES_KEY, subPath],
        {} as S,
        experimental_customMergeAllOf,
      );
      if (has(parentField, ONE_OF_KEY)) {
        // if this sub-path has a `oneOf` then use the formData to drill into the schema with the selected option
        parentField = findSelectedOptionInXxxOf(
          validator,
          rootSchema,
          parentField,
          fieldName,
          ONE_OF_KEY,
          get(formData, subPath),
          experimental_customMergeAllOf,
        )!;
      } else if (has(parentField, ANY_OF_KEY)) {
        // if this sub-path has a `anyOf` then use the formData to drill into the schema with the selected option
        parentField = findSelectedOptionInXxxOf(
          validator,
          rootSchema,
          parentField,
          fieldName,
          ANY_OF_KEY,
          get(formData, subPath),
          experimental_customMergeAllOf,
        )!;
      }
    });
  }

  if (has(parentField, ONE_OF_KEY)) {
    // When oneOf is in the root schema, use the formData to drill into the schema with the selected option
    parentField = findSelectedOptionInXxxOf(
      validator,
      rootSchema,
      parentField,
      fieldName,
      ONE_OF_KEY,
      formData,
      experimental_customMergeAllOf,
    )!;
  } else if (has(parentField, ANY_OF_KEY)) {
    // When anyOf is in the root schema, use the formData to drill into the schema with the selected option
    parentField = findSelectedOptionInXxxOf(
      validator,
      rootSchema,
      parentField,
      fieldName,
      ANY_OF_KEY,
      formData,
      experimental_customMergeAllOf,
    )!;
  }

  // taking the most updated `parentField`, get our desired field
  let field: S | undefined = getFromSchema<T, S, F>(
    validator,
    rootSchema,
    parentField,
    [PROPERTIES_KEY, fieldName],
    NOT_FOUND_SCHEMA as S,
    experimental_customMergeAllOf,
  );
  if (field === NOT_FOUND_SCHEMA) {
    field = undefined;
  }
  // check to see if our desired field is in the `required` list for its parent
  const requiredArray = getFromSchema<T, S, F>(
    validator,
    rootSchema,
    parentField,
    REQUIRED_KEY,
    [] as T,
    experimental_customMergeAllOf,
  );
  let isRequired: boolean | undefined;
  if (field && Array.isArray(requiredArray)) {
    isRequired = requiredArray.includes(fieldName);
  }

  return { field, isRequired };
}
