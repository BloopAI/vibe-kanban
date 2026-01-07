import get from 'lodash/get';
import set from 'lodash/set';
import times from 'lodash/times';
import transform from 'lodash/transform';
import merge from 'lodash/merge';
import flattenDeep from 'lodash/flattenDeep';
import uniq from 'lodash/uniq';
import mergeAllOf, { Options } from 'json-schema-merge-allof';

import {
  ADDITIONAL_PROPERTIES_KEY,
  ADDITIONAL_PROPERTY_FLAG,
  ALL_OF_KEY,
  ANY_OF_KEY,
  DEPENDENCIES_KEY,
  ID_KEY,
  IF_KEY,
  ITEMS_KEY,
  ONE_OF_KEY,
  PATTERN_PROPERTIES_KEY,
  PROPERTIES_KEY,
  REF_KEY,
} from '../constants';
import findSchemaDefinition, { splitKeyElementFromObject } from '../findSchemaDefinition';
import getDiscriminatorFieldFromSchema from '../getDiscriminatorFieldFromSchema';
import guessType from '../guessType';
import isObject from '../isObject';
import mergeSchemas from '../mergeSchemas';
import {
  Experimental_CustomMergeAllOf,
  FormContextType,
  GenericObjectType,
  RJSFSchema,
  StrictRJSFSchema,
  ValidatorType,
} from '../types';
import getFirstMatchingOption from './getFirstMatchingOption';
import deepEquals from '../deepEquals';
import isEmpty from 'lodash/isEmpty';

/** Retrieves an expanded schema that has had all of its conditions, additional properties, references and dependencies
 * resolved and merged into the `schema` given a `validator`, `rootSchema` and `rawFormData` that is used to do the
 * potentially recursive resolution.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which retrieving a schema is desired
 * @param [rootSchema={}] - The root schema that will be forwarded to all the APIs
 * @param [rawFormData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @param [resolveAnyOfOrOneOfRefs = false] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
 * @returns - The schema having its conditions, additional properties, references and dependencies resolved
 */
export default function retrieveSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S = {} as S,
  rawFormData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  resolveAnyOfOrOneOfRefs = false,
): S {
  return retrieveSchemaInternal<T, S, F>(
    validator,
    schema,
    rootSchema,
    rawFormData,
    undefined,
    undefined,
    experimental_customMergeAllOf,
    resolveAnyOfOrOneOfRefs,
  )[0];
}

/** Resolves a conditional block (if/else/then) by removing the condition and merging the appropriate conditional branch
 * with the rest of the schema. If `expandAllBranches` is true, then the `retrieveSchemaInteral()` results for both
 * conditions will be returned.
 *
 * @param validator - An implementation of the `ValidatorType` interface that is used to detect valid schema conditions
 * @param schema - The schema for which resolving a condition is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and
 *          dependencies as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - A list of schemas with the appropriate conditions resolved, possibly with all branches expanded
 */
export function resolveCondition<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S[] {
  const { if: expression, then, else: otherwise, ...resolvedSchemaLessConditional } = schema;

  const conditionValue = validator.isValid(expression as S, formData || ({} as T), rootSchema);
  let resolvedSchemas = [resolvedSchemaLessConditional as S];
  let schemas: S[] = [];
  if (expandAllBranches) {
    if (then && typeof then !== 'boolean') {
      schemas = schemas.concat(
        retrieveSchemaInternal<T, S, F>(
          validator,
          then as S,
          rootSchema,
          formData,
          expandAllBranches,
          recurseList,
          experimental_customMergeAllOf,
        ),
      );
    }
    if (otherwise && typeof otherwise !== 'boolean') {
      schemas = schemas.concat(
        retrieveSchemaInternal<T, S, F>(
          validator,
          otherwise as S,
          rootSchema,
          formData,
          expandAllBranches,
          recurseList,
          experimental_customMergeAllOf,
        ),
      );
    }
  } else {
    const conditionalSchema = conditionValue ? then : otherwise;
    if (conditionalSchema && typeof conditionalSchema !== 'boolean') {
      schemas = schemas.concat(
        retrieveSchemaInternal<T, S, F>(
          validator,
          conditionalSchema as S,
          rootSchema,
          formData,
          expandAllBranches,
          recurseList,
          experimental_customMergeAllOf,
        ),
      );
    }
  }
  if (schemas.length) {
    resolvedSchemas = schemas.map((s) => mergeSchemas(resolvedSchemaLessConditional, s) as S);
  }
  return resolvedSchemas.flatMap((s) =>
    retrieveSchemaInternal<T, S, F>(
      validator,
      s,
      rootSchema,
      formData,
      expandAllBranches,
      recurseList,
      experimental_customMergeAllOf,
    ),
  );
}

/** Given a list of lists of allOf, anyOf or oneOf values, create a list of lists of all permutations of the values. The
 * `listOfLists` is expected to be all resolved values of the 1st...nth schemas within an `allOf`, `anyOf` or `oneOf`.
 * From those lists, build a matrix for each `xxxOf` where there is more than one schema for a row in the list of lists.
 *
 * For example:
 * - If there are three xxxOf rows (A, B, C) and they have been resolved such that there is only one A, two B and three
 *   C schemas then:
 *   - The permutation for the first row is `[[A]]`
 *   - The permutations for the second row are `[[A,B1], [A,B2]]`
 *   - The permutations for the third row are `[[A,B1,C1], [A,B1,C2], [A,B1,C3], [A,B2,C1], [A,B2,C2], [A,B2,C3]]`
 *
 * @param listOfLists - The list of lists of elements that represent the allOf, anyOf or oneOf resolved values in order
 * @returns - The list of all permutations of schemas for a set of `xxxOf`s
 */
export function getAllPermutationsOfXxxOf<S extends StrictRJSFSchema = RJSFSchema>(listOfLists: S[][]) {
  const allPermutations: S[][] = listOfLists.reduce<S[][]>(
    (permutations, list) => {
      // When there are more than one set of schemas for a row, duplicate the set of permutations and add in the values
      if (list.length > 1) {
        return list.flatMap((element) => times(permutations.length, (i) => [...permutations[i]].concat(element)));
      }
      // Otherwise just push in the single value into the current set of permutations
      permutations.forEach((permutation) => permutation.push(list[0]));
      return permutations;
    },
    [[]] as S[][], // Start with an empty list
  );

  return allPermutations;
}

/** Returns the subset of 'patternProperties' specifications that match the given 'key'
 *
 * @param schema - The schema whose 'patternProperties' are to be filtered
 * @param key - The key to match against the 'patternProperties' specifications
 * @returns - The subset of 'patternProperties' specifications that match the given 'key'
 */
export function getMatchingPatternProperties<S extends StrictRJSFSchema = RJSFSchema>(
  schema: S,
  key: string,
): Required<S['patternProperties']> {
  return Object.keys(schema.patternProperties!)
    .filter((pattern: string) => RegExp(pattern).test(key))
    .reduce(
      (obj, pattern) => {
        // Pass the pattern using the `[]` index notation so that any `.` in the pattern are not used as a dotted path
        set(obj, [pattern], schema.patternProperties![pattern]);
        return obj;
      },
      {} as Required<S['patternProperties']>,
    );
}

/** Resolves references and dependencies within a schema and its 'allOf' children. Passes the `expandAllBranches` flag
 * down to the `retrieveSchemaInternal()`, `resolveReference()` and `resolveDependencies()` helper calls. If
 * `expandAllBranches` is true, then all possible dependencies and/or allOf branches are returned.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which resolving a schema is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @param [resolveAnyOfOrOneOfRefs] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
 * @returns - The list of schemas having its references, dependencies and allOf schemas resolved
 */
export function resolveSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  resolveAnyOfOrOneOfRefs?: boolean,
): S[] {
  const updatedSchemas = resolveReference<T, S, F>(
    validator,
    schema,
    rootSchema,
    expandAllBranches,
    recurseList,
    formData,
    experimental_customMergeAllOf,
    resolveAnyOfOrOneOfRefs,
  );
  if (updatedSchemas.length > 1 || updatedSchemas[0] !== schema) {
    // return the updatedSchemas array if it has either multiple schemas within it
    // OR the first schema is not the same as the original schema
    return updatedSchemas;
  }
  if (DEPENDENCIES_KEY in schema) {
    const resolvedSchemas = resolveDependencies<T, S, F>(
      validator,
      schema,
      rootSchema,
      expandAllBranches,
      recurseList,
      formData,
      experimental_customMergeAllOf,
    );
    return resolvedSchemas.flatMap((s) => {
      return retrieveSchemaInternal<T, S, F>(
        validator,
        s,
        rootSchema,
        formData,
        expandAllBranches,
        recurseList,
        experimental_customMergeAllOf,
      );
    });
  }
  if (ALL_OF_KEY in schema && Array.isArray(schema[ALL_OF_KEY])) {
    const allOfSchemaElements: S[][] = schema.allOf.map((allOfSubschema) =>
      retrieveSchemaInternal<T, S, F>(
        validator,
        allOfSubschema as S,
        rootSchema,
        formData,
        expandAllBranches,
        recurseList,
        experimental_customMergeAllOf,
      ),
    );
    const allPermutations = getAllPermutationsOfXxxOf<S>(allOfSchemaElements);
    return allPermutations.map((permutation) => ({
      ...schema,
      allOf: permutation,
    }));
  }
  // No $ref or dependencies or allOf attribute was found, returning the original schema.
  return [schema];
}

/** Resolves all references within a schema and then returns the `retrieveSchemaInternal()` if the resolved schema is
 * actually different than the original. Passes the `expandAllBranches` flag down to the `retrieveSchemaInternal()`
 * helper call.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which resolving a reference is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @param [resolveAnyOfOrOneOfRefs] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
 * @returns - The list schemas retrieved after having all references resolved
 */
export function resolveReference<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  resolveAnyOfOrOneOfRefs?: boolean,
): S[] {
  const updatedSchema = resolveAllReferences<S>(schema, rootSchema, recurseList, undefined, resolveAnyOfOrOneOfRefs);
  if (updatedSchema !== schema) {
    // Only call this if the schema was actually changed by the `resolveAllReferences()` function
    return retrieveSchemaInternal<T, S, F>(
      validator,
      updatedSchema,
      rootSchema,
      formData,
      expandAllBranches,
      recurseList,
      experimental_customMergeAllOf,
      resolveAnyOfOrOneOfRefs,
    );
  }
  return [schema];
}

/** Resolves all references within the schema itself as well as any of its properties and array items.
 *
 * @param schema - The schema for which resolving all references is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param recurseList - List of $refs already resolved to prevent recursion
 * @param [baseURI] - The base URI to be used for resolving relative references
 * @param [resolveAnyOfOrOneOfRefs] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
 * @returns - given schema will all references resolved or the original schema if no internal `$refs` were resolved
 */
export function resolveAllReferences<S extends StrictRJSFSchema = RJSFSchema>(
  schema: S,
  rootSchema: S,
  recurseList: string[],
  baseURI?: string,
  resolveAnyOfOrOneOfRefs?: boolean,
): S {
  if (!isObject(schema)) {
    return schema;
  }
  let resolvedSchema: S = schema;
  // resolve top level ref
  if (REF_KEY in resolvedSchema) {
    const { $ref, ...localSchema } = resolvedSchema;
    // Check for a recursive reference and stop the loop
    if (recurseList.includes($ref!)) {
      return resolvedSchema;
    }
    recurseList.push($ref!);
    // Retrieve the referenced schema definition.
    const refSchema = findSchemaDefinition<S>($ref, rootSchema, baseURI);
    resolvedSchema = { ...refSchema, ...localSchema };
    if (ID_KEY in resolvedSchema) {
      baseURI = resolvedSchema[ID_KEY];
    }
  }

  if (PROPERTIES_KEY in resolvedSchema) {
    const childrenLists: string[][] = [];
    const updatedProps = transform(
      resolvedSchema[PROPERTIES_KEY]!,
      (result, value, key: string) => {
        const childList: string[] = [...recurseList];
        result[key] = resolveAllReferences(value as S, rootSchema, childList, baseURI, resolveAnyOfOrOneOfRefs);
        childrenLists.push(childList);
      },
      {} as RJSFSchema,
    );
    merge(recurseList, uniq(flattenDeep(childrenLists)));
    resolvedSchema = { ...resolvedSchema, [PROPERTIES_KEY]: updatedProps };
  }

  if (
    ITEMS_KEY in resolvedSchema &&
    !Array.isArray(resolvedSchema.items) &&
    typeof resolvedSchema.items !== 'boolean'
  ) {
    resolvedSchema = {
      ...resolvedSchema,
      items: resolveAllReferences(resolvedSchema.items as S, rootSchema, recurseList, baseURI, resolveAnyOfOrOneOfRefs),
    };
  }

  if (resolveAnyOfOrOneOfRefs) {
    let key: 'anyOf' | 'oneOf' | undefined;
    let schemas: S[] | undefined;
    if (ANY_OF_KEY in schema && Array.isArray(schema[ANY_OF_KEY])) {
      key = ANY_OF_KEY;
      schemas = resolvedSchema[ANY_OF_KEY] as S[];
    } else if (ONE_OF_KEY in schema && Array.isArray(schema[ONE_OF_KEY])) {
      key = ONE_OF_KEY;
      schemas = resolvedSchema[ONE_OF_KEY] as S[];
    }
    if (key && schemas) {
      resolvedSchema = {
        ...resolvedSchema,
        [key]: schemas.map((s: S) =>
          resolveAllReferences(s, rootSchema, recurseList, baseURI, resolveAnyOfOrOneOfRefs),
        ),
      };
    }
  }

  return deepEquals(schema, resolvedSchema) ? schema : resolvedSchema;
}

/** Creates new 'properties' items for each key in the `formData`
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param theSchema - The schema for which the existing additional properties is desired
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s * @param validator
 * @param [aFormData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The updated schema with additional properties stubbed
 */
export function stubExistingAdditionalProperties<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  theSchema: S,
  rootSchema?: S,
  aFormData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S {
  // Clone the schema so that we don't ruin the consumer's original
  const schema = {
    ...theSchema,
    properties: { ...theSchema.properties },
  };

  // make sure formData is an object
  const formData: GenericObjectType = aFormData && isObject(aFormData) ? aFormData : {};
  Object.keys(formData).forEach((key) => {
    if (key in schema.properties) {
      // No need to stub, our schema already has the property
      return;
    }
    if (PATTERN_PROPERTIES_KEY in schema) {
      const matchingProperties = getMatchingPatternProperties(schema, key);
      if (!isEmpty(matchingProperties)) {
        schema.properties[key] = retrieveSchema<T, S, F>(
          validator,
          { [ALL_OF_KEY]: Object.values(matchingProperties) } as S,
          rootSchema,
          get(formData, [key]) as T,
          experimental_customMergeAllOf,
        );
        set(schema.properties, [key, ADDITIONAL_PROPERTY_FLAG], true);
        return;
      }
    }
    if (ADDITIONAL_PROPERTIES_KEY in schema && schema.additionalProperties !== false) {
      let additionalProperties: S['additionalProperties'];
      if (typeof schema.additionalProperties !== 'boolean') {
        if (REF_KEY in schema.additionalProperties!) {
          additionalProperties = retrieveSchema<T, S, F>(
            validator,
            { [REF_KEY]: get(schema.additionalProperties, [REF_KEY]) } as S,
            rootSchema,
            formData as T,
            experimental_customMergeAllOf,
          );
        } else if ('type' in schema.additionalProperties!) {
          additionalProperties = { ...schema.additionalProperties };
        } else if (ANY_OF_KEY in schema.additionalProperties! || ONE_OF_KEY in schema.additionalProperties!) {
          additionalProperties = {
            type: 'object',
            ...schema.additionalProperties,
          };
        } else {
          additionalProperties = { type: guessType(get(formData, [key])) };
        }
      } else {
        additionalProperties = { type: guessType(get(formData, [key])) };
      }

      // The type of our new key should match the additionalProperties value;
      schema.properties[key] = additionalProperties;
      // Set our additional property flag so we know it was dynamically added
      set(schema.properties, [key, ADDITIONAL_PROPERTY_FLAG], true);
    } else {
      // Invalid property
      schema.properties[key] = { type: 'null' };
      // Set our additional property flag so we know it was dynamically added
      set(schema.properties, [key, ADDITIONAL_PROPERTY_FLAG], true);
    }
  });

  return schema;
}

/** Internal handler that retrieves an expanded schema that has had all of its conditions, additional properties,
 * references and dependencies resolved and merged into the `schema` given a `validator`, `rootSchema` and `rawFormData`
 * that is used to do the potentially recursive resolution. If `expandAllBranches` is true, then all possible branches
 * of the schema and its references, conditions and dependencies are returned.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which retrieving a schema is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param [rawFormData] - The current formData, if any, to assist retrieving a schema
 * @param [expandAllBranches=false] - Flag, if true, will return all possible branches of conditions, any/oneOf and
 *          dependencies as a list of schemas
 * @param [recurseList=[]] - The optional, list of recursive references already processed
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @param [resolveAnyOfOrOneOfRefs] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
 * @returns - The schema(s) resulting from having its conditions, additional properties, references and dependencies
 *          resolved. Multiple schemas may be returned if `expandAllBranches` is true.
 */
export function retrieveSchemaInternal<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  rawFormData?: T,
  expandAllBranches = false,
  recurseList: string[] = [],
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  resolveAnyOfOrOneOfRefs?: boolean,
): S[] {
  if (!isObject(schema)) {
    return [{} as S];
  }
  const resolvedSchemas = resolveSchema<T, S, F>(
    validator,
    schema,
    rootSchema,
    expandAllBranches,
    recurseList,
    rawFormData,
    experimental_customMergeAllOf,
    resolveAnyOfOrOneOfRefs,
  );
  return resolvedSchemas.flatMap((s: S) => {
    let resolvedSchema = s;
    if (IF_KEY in resolvedSchema) {
      return resolveCondition<T, S, F>(
        validator,
        resolvedSchema,
        rootSchema,
        expandAllBranches,
        recurseList,
        rawFormData as T,
        experimental_customMergeAllOf,
      );
    }
    if (ALL_OF_KEY in resolvedSchema) {
      // resolve allOf schemas
      if (expandAllBranches) {
        const { allOf, ...restOfSchema } = resolvedSchema;
        return [...(allOf as S[]), restOfSchema as S];
      }
      try {
        const withContainsSchemas = [] as S[];
        const withoutContainsSchemas = [] as S[];
        resolvedSchema.allOf?.forEach((s) => {
          if (typeof s === 'object' && s.contains) {
            withContainsSchemas.push(s as S);
          } else {
            withoutContainsSchemas.push(s as S);
          }
        });
        if (withContainsSchemas.length) {
          resolvedSchema = { ...resolvedSchema, allOf: withoutContainsSchemas };
        }
        resolvedSchema = experimental_customMergeAllOf
          ? experimental_customMergeAllOf(resolvedSchema)
          : (mergeAllOf(resolvedSchema, {
              deep: false,
              resolvers: {
                $defs: mergeAllOf.options.resolvers.definitions,
              },
            } as Options) as S);
        if (withContainsSchemas.length) {
          resolvedSchema.allOf = withContainsSchemas;
        }
      } catch (e) {
        console.warn('could not merge subschemas in allOf:\n', e);
        const { allOf, ...resolvedSchemaWithoutAllOf } = resolvedSchema;
        return resolvedSchemaWithoutAllOf as S;
      }
    }
    if (PROPERTIES_KEY in resolvedSchema && PATTERN_PROPERTIES_KEY in resolvedSchema) {
      resolvedSchema = Object.keys(resolvedSchema.properties!).reduce(
        (schema, key) => {
          const matchingProperties = getMatchingPatternProperties(schema, key);
          if (!isEmpty(matchingProperties)) {
            schema.properties[key] = retrieveSchema<T, S, F>(
              validator,
              { allOf: [schema.properties[key], ...Object.values(matchingProperties)] } as S,
              rootSchema,
              get(rawFormData, [key]) as T,
              experimental_customMergeAllOf,
            );
          }
          return schema;
        },
        {
          ...resolvedSchema,
          properties: { ...resolvedSchema.properties },
        },
      );
    }
    const hasAdditionalProperties =
      PATTERN_PROPERTIES_KEY in resolvedSchema ||
      (ADDITIONAL_PROPERTIES_KEY in resolvedSchema && resolvedSchema.additionalProperties !== false);
    if (hasAdditionalProperties) {
      return stubExistingAdditionalProperties<T, S, F>(
        validator,
        resolvedSchema,
        rootSchema,
        rawFormData as T,
        experimental_customMergeAllOf,
      );
    }

    return resolvedSchema;
  });
}

/** Resolves an `anyOf` or `oneOf` within a schema (if present) to the list of schemas returned from
 * `retrieveSchemaInternal()` for the best matching option. If `expandAllBranches` is true, then a list of schemas for ALL
 * options are retrieved and returned.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which retrieving a schema is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param [rawFormData] - The current formData, if any, to assist retrieving a schema, defaults to an empty object
 * @returns - Either an array containing the best matching option or all options if `expandAllBranches` is true
 */
export function resolveAnyOrOneOfSchemas<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(validator: ValidatorType<T, S, F>, schema: S, rootSchema: S, expandAllBranches: boolean, rawFormData?: T) {
  let anyOrOneOf: S[] | undefined;
  const { oneOf, anyOf, ...remaining } = schema;
  if (Array.isArray(oneOf)) {
    anyOrOneOf = oneOf as S[];
  } else if (Array.isArray(anyOf)) {
    anyOrOneOf = anyOf as S[];
  }
  if (anyOrOneOf) {
    // Ensure that during expand all branches we pass an object rather than undefined so that all options are interrogated
    const formData = rawFormData === undefined && expandAllBranches ? ({} as T) : rawFormData;
    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    anyOrOneOf = anyOrOneOf.map((s) => {
      // Due to anyOf/oneOf possibly using the same $ref we always pass a fresh recurse list array so that each option
      // can resolve recursive references independently
      return resolveAllReferences(s, rootSchema, []);
    });
    // Call this to trigger the set of isValid() calls that the schema parser will need
    const option = getFirstMatchingOption<T, S, F>(validator, formData, anyOrOneOf, rootSchema, discriminator);
    if (expandAllBranches) {
      return anyOrOneOf.map((item) => mergeSchemas(remaining, item) as S);
    }
    schema = mergeSchemas(remaining, anyOrOneOf[option]) as S;
  }
  return [schema];
}

/** Resolves dependencies within a schema and its 'anyOf/oneOf' children. Passes the `expandAllBranches` flag down to
 * the `resolveAnyOrOneOfSchema()` and `processDependencies()` helper calls.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which resolving a dependency is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The list of schemas with their dependencies resolved
 */
export function resolveDependencies<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S[] {
  // Drop the dependencies from the source schema.
  const { dependencies, ...remainingSchema } = schema;
  const resolvedSchemas = resolveAnyOrOneOfSchemas<T, S, F>(
    validator,
    remainingSchema as S,
    rootSchema,
    expandAllBranches,
    formData,
  );
  return resolvedSchemas.flatMap((resolvedSchema) =>
    processDependencies<T, S, F>(
      validator,
      dependencies,
      resolvedSchema,
      rootSchema,
      expandAllBranches,
      recurseList,
      formData,
      experimental_customMergeAllOf,
    ),
  );
}

/** Processes all the `dependencies` recursively into the list of `resolvedSchema`s as needed. Passes the
 * `expandAllBranches` flag down to the `withDependentSchema()` and the recursive `processDependencies()` helper calls.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param dependencies - The set of dependencies that needs to be processed
 * @param resolvedSchema - The schema for which processing dependencies is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData, if any, to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The schema with the `dependencies` resolved into it
 */
export function processDependencies<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  dependencies: S['dependencies'],
  resolvedSchema: S,
  rootSchema: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S[] {
  let schemas = [resolvedSchema];
  // Process dependencies updating the local schema properties as appropriate.
  for (const dependencyKey in dependencies) {
    // Skip this dependency if its trigger property is not present.
    if (!expandAllBranches && get(formData, [dependencyKey]) === undefined) {
      continue;
    }
    // Skip this dependency if it is not included in the schema (such as when dependencyKey is itself a hidden dependency.)
    if (resolvedSchema.properties && !(dependencyKey in resolvedSchema.properties)) {
      continue;
    }
    const [remainingDependencies, dependencyValue] = splitKeyElementFromObject(
      dependencyKey,
      dependencies as GenericObjectType,
    );
    if (Array.isArray(dependencyValue)) {
      schemas[0] = withDependentProperties<S>(resolvedSchema, dependencyValue);
    } else if (isObject(dependencyValue)) {
      schemas = withDependentSchema<T, S, F>(
        validator,
        resolvedSchema,
        rootSchema,
        dependencyKey,
        dependencyValue as S,
        expandAllBranches,
        recurseList,
        formData,
        experimental_customMergeAllOf,
      );
    }
    return schemas.flatMap((schema) =>
      processDependencies<T, S, F>(
        validator,
        remainingDependencies,
        schema,
        rootSchema,
        expandAllBranches,
        recurseList,
        formData,
        experimental_customMergeAllOf,
      ),
    );
  }
  return schemas;
}

/** Updates a schema with additionally required properties added
 *
 * @param schema - The schema for which resolving a dependent properties is desired
 * @param [additionallyRequired] - An optional array of additionally required names
 * @returns - The schema with the additional required values merged in
 */
export function withDependentProperties<S extends StrictRJSFSchema = RJSFSchema>(
  schema: S,
  additionallyRequired?: string[],
) {
  if (!additionallyRequired) {
    return schema;
  }
  const required = Array.isArray(schema.required)
    ? Array.from(new Set([...schema.required, ...additionallyRequired]))
    : additionallyRequired;
  return { ...schema, required: required };
}

/** Merges a dependent schema into the `schema` dealing with oneOfs and references. Passes the `expandAllBranches` flag
 * down to the `retrieveSchemaInternal()`, `resolveReference()` and `withExactlyOneSubschema()` helper calls.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param schema - The schema for which resolving a dependent schema is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param dependencyKey - The key name of the dependency
 * @param dependencyValue - The potentially dependent schema
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData]- The current formData to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The list of schemas with the dependent schema resolved into them
 */
export function withDependentSchema<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  dependencyKey: string,
  dependencyValue: S,
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S[] {
  const dependentSchemas = retrieveSchemaInternal<T, S, F>(
    validator,
    dependencyValue,
    rootSchema,
    formData,
    expandAllBranches,
    recurseList,
    experimental_customMergeAllOf,
  );
  return dependentSchemas.flatMap((dependent) => {
    const { oneOf, ...dependentSchema } = dependent;
    schema = mergeSchemas(schema, dependentSchema) as S;
    // Since it does not contain oneOf, we return the original schema.
    if (oneOf === undefined) {
      return schema;
    }
    // Resolve $refs inside oneOf.
    const resolvedOneOfs = oneOf.map((subschema) => {
      if (typeof subschema === 'boolean' || !(REF_KEY in subschema)) {
        return [subschema as S];
      }
      return resolveReference<T, S, F>(validator, subschema as S, rootSchema, expandAllBranches, recurseList, formData);
    });
    const allPermutations = getAllPermutationsOfXxxOf(resolvedOneOfs);
    return allPermutations.flatMap((resolvedOneOf) =>
      withExactlyOneSubschema<T, S, F>(
        validator,
        schema,
        rootSchema,
        dependencyKey,
        resolvedOneOf,
        expandAllBranches,
        recurseList,
        formData,
        experimental_customMergeAllOf,
      ),
    );
  });
}

/** Returns a list of `schema`s with the best choice from the `oneOf` options merged into it. If `expandAllBranches` is
 * true, then a list of schemas for ALL options are retrieved and returned. Passes the `expandAllBranches` flag down to
 * the `retrieveSchemaInternal()` helper call.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used to validate oneOf options
 * @param schema - The schema for which resolving a oneOf subschema is desired
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param dependencyKey - The key name of the oneOf dependency
 * @param oneOf - The list of schemas representing the oneOf options
 * @param expandAllBranches - Flag, if true, will return all possible branches of conditions, any/oneOf and dependencies
 *          as a list of schemas
 * @param recurseList - The list of recursive references already processed
 * @param [formData] - The current formData to assist retrieving a schema
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - Either an array containing the best matching option or all options if `expandAllBranches` is true
 */
export function withExactlyOneSubschema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  dependencyKey: string,
  oneOf: S['oneOf'],
  expandAllBranches: boolean,
  recurseList: string[],
  formData?: T,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): S[] {
  const validSubschemas = oneOf!.filter((subschema) => {
    if (typeof subschema === 'boolean' || !subschema || !subschema.properties) {
      return false;
    }
    const { [dependencyKey]: conditionPropertySchema } = subschema.properties;
    if (conditionPropertySchema) {
      const conditionSchema: S = {
        type: 'object',
        properties: {
          [dependencyKey]: conditionPropertySchema,
        },
      } as S;
      return validator.isValid(conditionSchema, formData, rootSchema) || expandAllBranches;
    }
    return false;
  });

  if (!expandAllBranches && validSubschemas!.length !== 1) {
    console.warn("ignoring oneOf in dependencies because there isn't exactly one subschema that is valid");
    return [schema];
  }
  return validSubschemas.flatMap((s) => {
    const subschema: S = s as S;
    const [dependentSubschema] = splitKeyElementFromObject(dependencyKey, subschema.properties as GenericObjectType);
    const dependentSchema = { ...subschema, properties: dependentSubschema };
    const schemas = retrieveSchemaInternal<T, S, F>(
      validator,
      dependentSchema,
      rootSchema,
      formData,
      expandAllBranches,
      recurseList,
      experimental_customMergeAllOf,
    );
    return schemas.map((s) => mergeSchemas(schema, s) as S);
  });
}
