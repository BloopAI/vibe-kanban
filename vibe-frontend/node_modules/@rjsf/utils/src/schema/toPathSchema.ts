import get from 'lodash/get';
import set from 'lodash/set';

import {
  ADDITIONAL_PROPERTIES_KEY,
  ALL_OF_KEY,
  ANY_OF_KEY,
  DEPENDENCIES_KEY,
  ITEMS_KEY,
  NAME_KEY,
  ONE_OF_KEY,
  PROPERTIES_KEY,
  REF_KEY,
  RJSF_ADDITIONAL_PROPERTIES_FLAG,
} from '../constants';
import getDiscriminatorFieldFromSchema from '../getDiscriminatorFieldFromSchema';
import {
  Experimental_CustomMergeAllOf,
  FormContextType,
  GenericObjectType,
  PathSchema,
  RJSFSchema,
  StrictRJSFSchema,
  ValidatorType,
} from '../types';
import getClosestMatchingOption from './getClosestMatchingOption';
import retrieveSchema from './retrieveSchema';
import deepEquals from '../deepEquals';

/** An internal helper that generates an `PathSchema` object for the `schema`, recursively with protection against
 * infinite recursion
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which the `PathSchema` is desired
 * @param [name=''] - The base name for the schema
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [_recurseList=[]] - The list of retrieved schemas currently being recursed, used to prevent infinite recursion
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The `PathSchema` object for the `schema`
 */
function toPathSchemaInternal<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  name: string,
  rootSchema?: S,
  formData?: T,
  _recurseList: S[] = [],
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): PathSchema<T> {
  if (REF_KEY in schema || DEPENDENCIES_KEY in schema || ALL_OF_KEY in schema) {
    const _schema = retrieveSchema<T, S, F>(validator, schema, rootSchema, formData, experimental_customMergeAllOf);
    const sameSchemaIndex = _recurseList.findIndex((item) => deepEquals(item, _schema));
    if (sameSchemaIndex === -1) {
      return toPathSchemaInternal<T, S, F>(
        validator,
        _schema,
        name,
        rootSchema,
        formData,
        _recurseList.concat(_schema),
        experimental_customMergeAllOf,
      );
    }
  }

  let pathSchema: PathSchema<T> = {
    [NAME_KEY]: name.replace(/^\./, ''),
  } as PathSchema<T>;

  if (ONE_OF_KEY in schema || ANY_OF_KEY in schema) {
    const xxxOf: S[] = ONE_OF_KEY in schema ? (schema.oneOf as S[]) : (schema.anyOf as S[]);
    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    const index = getClosestMatchingOption<T, S, F>(
      validator,
      rootSchema!,
      formData,
      xxxOf,
      0,
      discriminator,
      experimental_customMergeAllOf,
    );
    const _schema: S = xxxOf![index] as S;
    pathSchema = {
      ...pathSchema,
      ...toPathSchemaInternal<T, S, F>(
        validator,
        _schema,
        name,
        rootSchema,
        formData,
        _recurseList,
        experimental_customMergeAllOf,
      ),
    };
  }

  if (ADDITIONAL_PROPERTIES_KEY in schema && schema[ADDITIONAL_PROPERTIES_KEY] !== false) {
    set(pathSchema, RJSF_ADDITIONAL_PROPERTIES_FLAG, true);
  }

  if (ITEMS_KEY in schema && Array.isArray(formData)) {
    const { items: schemaItems, additionalItems: schemaAdditionalItems } = schema;

    if (Array.isArray(schemaItems)) {
      formData.forEach((element, i: number) => {
        if (schemaItems[i]) {
          (pathSchema as PathSchema<T[]>)[i] = toPathSchemaInternal<T, S, F>(
            validator,
            schemaItems[i] as S,
            `${name}.${i}`,
            rootSchema,
            element,
            _recurseList,
            experimental_customMergeAllOf,
          );
        } else if (schemaAdditionalItems) {
          (pathSchema as PathSchema<T[]>)[i] = toPathSchemaInternal<T, S, F>(
            validator,
            schemaAdditionalItems as S,
            `${name}.${i}`,
            rootSchema,
            element,
            _recurseList,
            experimental_customMergeAllOf,
          );
        } else {
          console.warn(`Unable to generate path schema for "${name}.${i}". No schema defined for it`);
        }
      });
    } else {
      formData.forEach((element, i: number) => {
        (pathSchema as PathSchema<T[]>)[i] = toPathSchemaInternal<T, S, F>(
          validator,
          schemaItems as S,
          `${name}.${i}`,
          rootSchema,
          element,
          _recurseList,
          experimental_customMergeAllOf,
        );
      });
    }
  } else if (PROPERTIES_KEY in schema) {
    for (const property in schema.properties) {
      const field: S = get(schema, [PROPERTIES_KEY, property], {}) as S;
      (pathSchema as PathSchema<GenericObjectType>)[property] = toPathSchemaInternal<T, S, F>(
        validator,
        field,
        `${name}.${property}`,
        rootSchema,
        // It's possible that formData is not an object -- this can happen if an
        // array item has just been added, but not populated with data yet
        get(formData, [property]),
        _recurseList,
        experimental_customMergeAllOf,
      );
    }
  }
  return pathSchema;
}

/** Generates an `PathSchema` object for the `schema`, recursively
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which the `PathSchema` is desired
 * @param [name=''] - The base name for the schema
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The `PathSchema` object for the `schema`
 */
export default function toPathSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  name = '',
  rootSchema?: S,
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): PathSchema<T> {
  return toPathSchemaInternal(validator, schema, name, rootSchema, formData, undefined, experimental_customMergeAllOf);
}
