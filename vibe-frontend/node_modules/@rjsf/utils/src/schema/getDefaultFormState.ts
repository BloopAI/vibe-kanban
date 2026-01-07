import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { JSONSchema7Object } from 'json-schema';

import {
  ALL_OF_KEY,
  ANY_OF_KEY,
  CONST_KEY,
  DEFAULT_KEY,
  DEPENDENCIES_KEY,
  ONE_OF_KEY,
  PROPERTIES_KEY,
  REF_KEY,
} from '../constants';
import findSchemaDefinition from '../findSchemaDefinition';
import getClosestMatchingOption from './getClosestMatchingOption';
import getDiscriminatorFieldFromSchema from '../getDiscriminatorFieldFromSchema';
import getSchemaType from '../getSchemaType';
import isObject from '../isObject';
import isFixedItems from '../isFixedItems';
import mergeDefaultsWithFormData from '../mergeDefaultsWithFormData';
import mergeObjects from '../mergeObjects';
import mergeSchemas from '../mergeSchemas';
import {
  Experimental_CustomMergeAllOf,
  Experimental_DefaultFormStateBehavior,
  FormContextType,
  GenericObjectType,
  RJSFSchema,
  StrictRJSFSchema,
  ValidatorType,
} from '../types';
import isMultiSelect from './isMultiSelect';
import isSelect from './isSelect';
import retrieveSchema, { resolveDependencies } from './retrieveSchema';
import isConstant from '../isConstant';
import constIsAjvDataReference from '../constIsAjvDataReference';
import optionsList from '../optionsList';
import deepEquals from '../deepEquals';

const PRIMITIVE_TYPES = ['string', 'number', 'integer', 'boolean', 'null'];

/** Enum that indicates how `schema.additionalItems` should be handled by the `getInnerSchemaForArrayItem()` function.
 */
export enum AdditionalItemsHandling {
  Ignore,
  Invert,
  Fallback,
}

/** Given a `schema` will return an inner schema that for an array item. This is computed differently based on the
 * `additionalItems` enum and the value of `idx`. There are four possible returns:
 * 1. If `idx` is >= 0, then if `schema.items` is an array the `idx`th element of the array is returned if it is a valid
 *    index and not a boolean, otherwise it falls through to 3.
 * 2. If `schema.items` is not an array AND truthy and not a boolean, then `schema.items` is returned since it actually
 *    is a schema, otherwise it falls through to 3.
 * 3. If `additionalItems` is not `AdditionalItemsHandling.Ignore` and `schema.additionalItems` is an object, then
 *    `schema.additionalItems` is returned since it actually is a schema, otherwise it falls through to 4.
 * 4. {} is returned representing an empty schema
 *
 * @param schema - The schema from which to get the particular item
 * @param [additionalItems=AdditionalItemsHandling.Ignore] - How do we want to handle additional items?
 * @param [idx=-1] - Index, if non-negative, will be used to return the idx-th element in a `schema.items` array
 * @returns - The best fit schema object from the `schema` given the `additionalItems` and `idx` modifiers
 */
export function getInnerSchemaForArrayItem<S extends StrictRJSFSchema = RJSFSchema>(
  schema: S,
  additionalItems: AdditionalItemsHandling = AdditionalItemsHandling.Ignore,
  idx = -1,
): S {
  if (idx >= 0) {
    if (Array.isArray(schema.items) && idx < schema.items.length) {
      const item = schema.items[idx];
      if (typeof item !== 'boolean') {
        return item as S;
      }
    }
  } else if (schema.items && !Array.isArray(schema.items) && typeof schema.items !== 'boolean') {
    return schema.items as S;
  }
  if (additionalItems !== AdditionalItemsHandling.Ignore && isObject(schema.additionalItems)) {
    return schema.additionalItems as S;
  }
  return {} as S;
}

/** Checks if the given `schema` contains the `null` type along with another type AND if the `default` contained within
 * the schema is `null` AND the `computedDefault` is empty. If all of those conditions are true, then the `schema`'s
 * default should be `null` rather than `computedDefault`.
 *
 * @param schema - The schema to inspect
 * @param computedDefault - The computed default for the schema
 * @returns - Flag indicating whether a null should be returned instead of the computedDefault
 */
export function computeDefaultBasedOnSchemaTypeAndDefaults<T = any, S extends StrictRJSFSchema = RJSFSchema>(
  schema: S,
  computedDefault: T,
) {
  const { default: schemaDefault, type } = schema;
  const shouldReturnNullAsDefault =
    Array.isArray(type) && type.includes('null') && isEmpty(computedDefault) && schemaDefault === null;
  return shouldReturnNullAsDefault ? (null as T) : computedDefault;
}

/** Either add `computedDefault` at `key` into `obj` or not add it based on its value, the value of
 * `includeUndefinedValues`, the value of `emptyObjectFields` and if its parent field is required. Generally undefined
 * `computedDefault` values are added only when `includeUndefinedValues` is either true/"excludeObjectChildren". If `
 * includeUndefinedValues` is false and `emptyObjectFields` is not "skipDefaults", then non-undefined and non-empty-object
 * values will be added based on certain conditions.
 *
 * @param obj - The object into which the computed default may be added
 * @param key - The key into the object at which the computed default may be added
 * @param computedDefault - The computed default value that maybe should be added to the obj
 * @param includeUndefinedValues - Optional flag, if true, cause undefined values to be added as defaults.
 *          If "excludeObjectChildren", cause undefined values for this object and pass `includeUndefinedValues` as
 *          false when computing defaults for any nested object properties. If "allowEmptyObject", prevents undefined
 *          values in this object while allow the object itself to be empty and passing `includeUndefinedValues` as
 *          false when computing defaults for any nested object properties.
 * @param isParentRequired - The optional boolean that indicates whether the parent field is required
 * @param requiredFields - The list of fields that are required
 * @param experimental_defaultFormStateBehavior - Optional configuration object, if provided, allows users to override
 *        default form state behavior
 * @param isConst - Optional flag, if true, indicates that the schema has a const property defined, thus we should always return the computedDefault since it's coming from the const.
 * @param isNullType - The type of the schema is null
 */
function maybeAddDefaultToObject<T = any>(
  obj: GenericObjectType,
  key: string,
  computedDefault: T | T[] | undefined,
  includeUndefinedValues: boolean | 'excludeObjectChildren',
  isParentRequired?: boolean,
  requiredFields: string[] = [],
  experimental_defaultFormStateBehavior: Experimental_DefaultFormStateBehavior = {},
  isConst = false,
  isNullType = false,
) {
  const { emptyObjectFields = 'populateAllDefaults' } = experimental_defaultFormStateBehavior;

  if (includeUndefinedValues === true || isConst) {
    // If includeUndefinedValues is explicitly true
    // Or if the schema has a const property defined, then we should always return the computedDefault since it's coming from the const.
    obj[key] = computedDefault;
  } else if (includeUndefinedValues === 'excludeObjectChildren') {
    // Fix for Issue #4709: When in 'excludeObjectChildren' mode, don't set primitive fields to empty objects
    // Only add the computed default if it's not an empty object placeholder for a primitive field
    if ((isNullType && computedDefault !== undefined) || !isObject(computedDefault) || !isEmpty(computedDefault)) {
      obj[key] = computedDefault;
    }
    // If computedDefault is an empty object {}, don't add it - let the field stay undefined
  } else if (emptyObjectFields !== 'skipDefaults') {
    // If isParentRequired is undefined, then we are at the root level of the schema so defer to the requiredness of
    // the field key itself in the `requiredField` list
    const isSelfOrParentRequired = isParentRequired === undefined ? requiredFields.includes(key) : isParentRequired;

    if (isObject(computedDefault)) {
      // If emptyObjectFields 'skipEmptyDefaults' store computedDefault if it's a non-empty object(e.g. not {})
      if (emptyObjectFields === 'skipEmptyDefaults') {
        if (!isEmpty(computedDefault)) {
          obj[key] = computedDefault;
        }
      } // Else store computedDefault if it's a non-empty object(e.g. not {}) and satisfies certain conditions
      // Condition 1: If computedDefault is not empty or if the key is a required field
      // Condition 2: If the parent object is required or emptyObjectFields is not 'populateRequiredDefaults'
      else if (
        (!isEmpty(computedDefault) || requiredFields.includes(key)) &&
        (isSelfOrParentRequired || emptyObjectFields !== 'populateRequiredDefaults')
      ) {
        obj[key] = computedDefault;
      }
    } else if (
      // Store computedDefault if it's a defined primitive (e.g., true) and satisfies certain conditions
      // Condition 1: computedDefault is not undefined
      // Condition 2: If emptyObjectFields is 'populateAllDefaults' or 'skipEmptyDefaults)
      // Or if isSelfOrParentRequired is 'true' and the key is a required field
      computedDefault !== undefined &&
      (emptyObjectFields === 'populateAllDefaults' ||
        emptyObjectFields === 'skipEmptyDefaults' ||
        (isSelfOrParentRequired && requiredFields.includes(key)))
    ) {
      obj[key] = computedDefault;
    }
  }
}

interface ComputeDefaultsProps<T = any, S extends StrictRJSFSchema = RJSFSchema> {
  /** Any defaults provided by the parent field in the schema */
  parentDefaults?: T;
  /** The options root schema, used to primarily to look up `$ref`s */
  rootSchema?: S;
  /** The current formData, if any, onto which to provide any missing defaults */
  rawFormData?: T;
  /** Optional flag, if true, cause undefined values to be added as defaults.
   *          If "excludeObjectChildren", cause undefined values for this object and pass `includeUndefinedValues` as
   *          false when computing defaults for any nested object properties.
   */
  includeUndefinedValues?: boolean | 'excludeObjectChildren';
  /** The list of ref names currently being recursed, used to prevent infinite recursion */
  _recurseList?: string[];
  /** Optional configuration object, if provided, allows users to override default form state behavior */
  experimental_defaultFormStateBehavior?: Experimental_DefaultFormStateBehavior;
  /** Optional function that allows for custom merging of `allOf` schemas */
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>;
  /** Optional flag, if true, indicates this schema was required in the parent schema. */
  required?: boolean;
  /** Optional flag, if true, indicates this schema was required because it is the root. */
  requiredAsRoot?: boolean;
  /** Optional flag, if true, It will merge defaults into formData.
   *  The formData should take precedence unless it's not valid. This is useful when for example the value from formData does not exist in the schema 'enum' property, in such cases we take the value from the defaults because the value from the formData is not valid.
   */
  shouldMergeDefaultsIntoFormData?: boolean;
  /** Indicates whether initial defaults have been generated */
  initialDefaultsGenerated?: boolean;
}

/** Computes the defaults for the current `schema` given the `rawFormData` and `parentDefaults` if any. This drills into
 * each level of the schema, recursively, to fill out every level of defaults provided by the schema.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be used when necessary
 * @param rawSchema - The schema for which the default state is desired
 * @param {ComputeDefaultsProps} computeDefaultsProps - Optional props for this function
 * @returns - The resulting `formData` with all the defaults provided
 */
export function computeDefaults<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  rawSchema: S,
  computeDefaultsProps: ComputeDefaultsProps<T, S> = {},
): T | T[] | undefined {
  const {
    parentDefaults,
    rawFormData,
    rootSchema = {} as S,
    includeUndefinedValues = false,
    _recurseList = [],
    experimental_defaultFormStateBehavior = undefined,
    experimental_customMergeAllOf = undefined,
    required,
    shouldMergeDefaultsIntoFormData = false,
    initialDefaultsGenerated,
  } = computeDefaultsProps;
  let formData: T = (isObject(rawFormData) ? rawFormData : {}) as T;
  const schema: S = isObject(rawSchema) ? rawSchema : ({} as S);
  // Compute the defaults recursively: give highest priority to deepest nodes.
  let defaults: T | T[] | undefined = parentDefaults;
  // If we get a new schema, then we need to recompute defaults again for the new schema found.
  let schemaToCompute: S | null = null;
  let experimental_dfsb_to_compute = experimental_defaultFormStateBehavior;
  let updatedRecurseList = _recurseList;
  if (
    schema[CONST_KEY] !== undefined &&
    experimental_defaultFormStateBehavior?.constAsDefaults !== 'never' &&
    !constIsAjvDataReference(schema)
  ) {
    defaults = schema[CONST_KEY] as unknown as T;
  } else if (isObject(defaults) && isObject(schema.default)) {
    // For object defaults, only override parent defaults that are defined in
    // schema.default.
    defaults = mergeObjects(defaults!, schema.default as GenericObjectType) as T;
  } else if (DEFAULT_KEY in schema && !schema[ANY_OF_KEY] && !schema[ONE_OF_KEY] && !schema[REF_KEY]) {
    // If the schema has a default value, then we should use it as the default.
    // And if the schema does not have anyOf or oneOf, this is done because we need to merge the defaults with the formData.
    defaults = schema.default as unknown as T;
  } else if (REF_KEY in schema) {
    const refName = schema[REF_KEY];
    // Use referenced schema defaults for this node.
    if (!_recurseList.includes(refName!)) {
      updatedRecurseList = _recurseList.concat(refName!);
      schemaToCompute = findSchemaDefinition<S>(refName, rootSchema);
    }

    // If the referenced schema exists and parentDefaults is not set
    // Then set the defaults from the current schema for the referenced schema
    if (schemaToCompute && !defaults) {
      defaults = schema.default as T | undefined;
    }

    // If shouldMergeDefaultsIntoFormData is true
    // And the schemaToCompute is set and the rawFormData is not an object
    // Then set the formData to the rawFormData
    if (shouldMergeDefaultsIntoFormData && schemaToCompute && !isObject(rawFormData)) {
      formData = rawFormData as T;
    }
  } else if (DEPENDENCIES_KEY in schema) {
    // Get the default if set from properties to ensure the dependencies conditions are resolved based on it
    const defaultFormData: T = {
      ...getDefaultBasedOnSchemaType(validator, schema, computeDefaultsProps, defaults),
      ...formData,
    };
    const resolvedSchema = resolveDependencies<T, S, F>(
      validator,
      schema,
      rootSchema,
      false,
      [],
      defaultFormData,
      experimental_customMergeAllOf,
    );
    schemaToCompute = resolvedSchema[0]; // pick the first element from resolve dependencies
  } else if (isFixedItems(schema)) {
    defaults = (schema.items! as S[]).map((itemSchema: S, idx: number) =>
      computeDefaults<T, S>(validator, itemSchema, {
        rootSchema,
        includeUndefinedValues,
        _recurseList,
        experimental_defaultFormStateBehavior,
        experimental_customMergeAllOf,
        parentDefaults: Array.isArray(parentDefaults) ? parentDefaults[idx] : undefined,
        rawFormData: formData as T,
        required,
        shouldMergeDefaultsIntoFormData,
      }),
    ) as T[];
  } else if (ONE_OF_KEY in schema) {
    const { oneOf, ...remaining } = schema;
    if (oneOf!.length === 0) {
      return undefined;
    }
    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    const { type = 'null' } = remaining;
    if (
      !Array.isArray(type) &&
      PRIMITIVE_TYPES.includes(type) &&
      experimental_dfsb_to_compute?.constAsDefaults === 'skipOneOf'
    ) {
      // If we are in a oneOf of a primitive type, then we want to pass constAsDefaults as 'never' for the recursion
      experimental_dfsb_to_compute = {
        ...experimental_dfsb_to_compute,
        constAsDefaults: 'never',
      };
    }
    schemaToCompute = oneOf![
      getClosestMatchingOption<T, S, F>(
        validator,
        rootSchema,
        rawFormData ?? (schema.default as T),
        oneOf as S[],
        0,
        discriminator,
        experimental_customMergeAllOf,
      )
    ] as S;
    schemaToCompute = mergeSchemas(remaining, schemaToCompute) as S;
  } else if (ANY_OF_KEY in schema) {
    const { anyOf, ...remaining } = schema;
    if (anyOf!.length === 0) {
      return undefined;
    }
    const discriminator = getDiscriminatorFieldFromSchema<S>(schema);
    schemaToCompute = anyOf![
      getClosestMatchingOption<T, S, F>(
        validator,
        rootSchema,
        rawFormData ?? (schema.default as T),
        anyOf as S[],
        0,
        discriminator,
        experimental_customMergeAllOf,
      )
    ] as S;
    schemaToCompute = mergeSchemas(remaining, schemaToCompute) as S;
  }

  if (schemaToCompute) {
    return computeDefaults<T, S, F>(validator, schemaToCompute, {
      rootSchema,
      includeUndefinedValues,
      _recurseList: updatedRecurseList,
      experimental_defaultFormStateBehavior: experimental_dfsb_to_compute,
      experimental_customMergeAllOf,
      parentDefaults: defaults as T | undefined,
      rawFormData: (rawFormData ?? formData) as T,
      required,
      shouldMergeDefaultsIntoFormData,
      initialDefaultsGenerated,
    });
  }

  // No defaults defined for this node, fallback to generic typed ones.
  if (defaults === undefined) {
    defaults = schema.default as unknown as T;
  }

  const defaultBasedOnSchemaType = getDefaultBasedOnSchemaType(validator, schema, computeDefaultsProps, defaults);

  let defaultsWithFormData = defaultBasedOnSchemaType ?? defaults;
  // if shouldMergeDefaultsIntoFormData is true, then merge the defaults into the formData.
  if (shouldMergeDefaultsIntoFormData) {
    const { arrayMinItems = {} } = experimental_defaultFormStateBehavior || {};
    const { mergeExtraDefaults } = arrayMinItems;

    const matchingFormData = ensureFormDataMatchingSchema(
      validator,
      schema,
      rootSchema,
      rawFormData,
      experimental_defaultFormStateBehavior,
      experimental_customMergeAllOf,
    );
    if (!isObject(rawFormData) || ALL_OF_KEY in schema) {
      // If the formData is not an object which means it's a primitive field, then we need to merge the defaults into the formData.
      // Or if the schema has allOf, we need to merge the defaults into the formData because we don't compute the defaults for allOf.
      defaultsWithFormData = mergeDefaultsWithFormData<T>(
        defaultsWithFormData as T,
        matchingFormData as T,
        mergeExtraDefaults,
        true,
      ) as T;
    }
  }

  return defaultsWithFormData;
}

/**
 * Ensure that the formData matches the given schema. If it's not matching in the case of a selectField, we change it to match the schema.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which the formData state is desired
 * @param rootSchema - The root schema, used to primarily to look up `$ref`s
 * @param formData - The current formData
 * @param [experimental_defaultFormStateBehavior] - Optional configuration object, if provided, allows users to override default form state behavior
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - valid formData that matches schema
 */
export function ensureFormDataMatchingSchema<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  rootSchema: S,
  formData: T | undefined,
  experimental_defaultFormStateBehavior?: Experimental_DefaultFormStateBehavior,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): T | T[] | undefined {
  const isSelectField =
    !isConstant<S>(schema) && isSelect<T, S, F>(validator, schema, rootSchema, experimental_customMergeAllOf);
  let validFormData: T | T[] | undefined = formData;
  if (isSelectField) {
    const getOptionsList = optionsList<T, S, F>(schema);
    const isValid = getOptionsList?.some((option) => deepEquals(option.value, formData));
    validFormData = isValid ? formData : undefined;
  }

  // Override the formData with the const if the constAsDefaults is set to always
  const constTakesPrecedence = schema[CONST_KEY] && experimental_defaultFormStateBehavior?.constAsDefaults === 'always';
  if (constTakesPrecedence) {
    validFormData = schema.const as T;
  }

  return validFormData;
}

/** Computes the default value for objects.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be used when necessary
 * @param rawSchema - The schema for which the default state is desired
 * @param {ComputeDefaultsProps} computeDefaultsProps - Optional props for this function
 * @param defaults - Optional props for this function
 * @returns - The default value based on the schema type if they are defined for object or array schemas.
 */
export function getObjectDefaults<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  rawSchema: S,
  {
    rawFormData,
    rootSchema = {} as S,
    includeUndefinedValues = false,
    _recurseList = [],
    experimental_defaultFormStateBehavior = undefined,
    experimental_customMergeAllOf = undefined,
    required,
    shouldMergeDefaultsIntoFormData,
    initialDefaultsGenerated,
  }: ComputeDefaultsProps<T, S> = {},
  defaults?: T | T[],
): T {
  {
    const formData: T = (isObject(rawFormData) ? rawFormData : {}) as T;
    const schema: S = rawSchema;
    // This is a custom addition that fixes this issue:
    // https://github.com/rjsf-team/react-jsonschema-form/issues/3832
    const retrievedSchema =
      experimental_defaultFormStateBehavior?.allOf === 'populateDefaults' && ALL_OF_KEY in schema
        ? retrieveSchema<T, S, F>(validator, schema, rootSchema, formData, experimental_customMergeAllOf)
        : schema;
    const parentConst = retrievedSchema[CONST_KEY];
    const objectDefaults = Object.keys(retrievedSchema.properties || {}).reduce(
      (acc: GenericObjectType, key: string) => {
        const propertySchema: S = get(retrievedSchema, [PROPERTIES_KEY, key], {}) as S;
        // Check if the parent schema has a const property defined AND we are supporting const as defaults, then we
        // should always return the computedDefault since it's coming from the const.
        const hasParentConst = isObject(parentConst) && (parentConst as JSONSchema7Object)[key] !== undefined;
        const hasConst =
          ((isObject(propertySchema) && CONST_KEY in propertySchema) || hasParentConst) &&
          experimental_defaultFormStateBehavior?.constAsDefaults !== 'never' &&
          !constIsAjvDataReference(propertySchema);
        // Compute the defaults for this node, with the parent defaults we might
        // have from a previous run: defaults[key].
        const computedDefault = computeDefaults<T, S, F>(validator, propertySchema, {
          rootSchema,
          _recurseList,
          experimental_defaultFormStateBehavior,
          experimental_customMergeAllOf,
          includeUndefinedValues: includeUndefinedValues === true,
          parentDefaults: get(defaults, [key]),
          rawFormData: get(formData, [key]),
          required: retrievedSchema.required?.includes(key),
          shouldMergeDefaultsIntoFormData,
          initialDefaultsGenerated,
        });

        maybeAddDefaultToObject<T>(
          acc,
          key,
          computedDefault,
          includeUndefinedValues,
          required,
          retrievedSchema.required,
          experimental_defaultFormStateBehavior,
          hasConst,
          propertySchema?.type === 'null',
        );

        return acc;
      },
      {},
    ) as T;
    if (retrievedSchema.additionalProperties && !initialDefaultsGenerated) {
      // as per spec additionalProperties may be either schema or boolean
      const additionalPropertiesSchema = isObject(retrievedSchema.additionalProperties)
        ? retrievedSchema.additionalProperties
        : {};

      const keys = new Set<string>();
      if (isObject(defaults)) {
        Object.keys(defaults as GenericObjectType)
          .filter((key) => !retrievedSchema.properties || !retrievedSchema.properties[key])
          .forEach((key) => keys.add(key));
      }
      const formDataRequired: string[] = [];
      Object.keys(formData as GenericObjectType)
        .filter((key) => !retrievedSchema.properties || !retrievedSchema.properties[key])
        .forEach((key) => {
          keys.add(key);
          formDataRequired.push(key);
        });
      keys.forEach((key) => {
        const computedDefault = computeDefaults(validator, additionalPropertiesSchema as S, {
          rootSchema,
          _recurseList,
          experimental_defaultFormStateBehavior,
          experimental_customMergeAllOf,
          includeUndefinedValues: includeUndefinedValues === true,
          parentDefaults: get(defaults, [key]),
          rawFormData: get(formData, [key]),
          required: retrievedSchema.required?.includes(key),
          shouldMergeDefaultsIntoFormData,
          initialDefaultsGenerated,
        });
        // Since these are additional properties we don't need to add the `experimental_defaultFormStateBehavior` prop
        maybeAddDefaultToObject<T>(
          objectDefaults as GenericObjectType,
          key,
          computedDefault,
          includeUndefinedValues,
          required,
          formDataRequired,
        );
      });
    }
    return computeDefaultBasedOnSchemaTypeAndDefaults<T, S>(rawSchema, objectDefaults);
  }
}

/** Computes the default value for arrays.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be used when necessary
 * @param rawSchema - The schema for which the default state is desired
 * @param {ComputeDefaultsProps} computeDefaultsProps - Optional props for this function
 * @param defaults - Optional props for this function
 * @returns - The default value based on the schema type if they are defined for object or array schemas.
 */
export function getArrayDefaults<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  validator: ValidatorType<T, S, F>,
  rawSchema: S,
  {
    rawFormData,
    rootSchema = {} as S,
    _recurseList = [],
    experimental_defaultFormStateBehavior = undefined,
    experimental_customMergeAllOf = undefined,
    required,
    requiredAsRoot = false,
    shouldMergeDefaultsIntoFormData,
    initialDefaultsGenerated,
  }: ComputeDefaultsProps<T, S> = {},
  defaults?: T[],
): T[] | undefined {
  const schema: S = rawSchema;

  const arrayMinItemsStateBehavior = experimental_defaultFormStateBehavior?.arrayMinItems ?? {};
  const { populate: arrayMinItemsPopulate, mergeExtraDefaults: arrayMergeExtraDefaults } = arrayMinItemsStateBehavior;

  const neverPopulate = arrayMinItemsPopulate === 'never';
  const ignoreMinItemsFlagSet = arrayMinItemsPopulate === 'requiredOnly';
  const isPopulateAll = arrayMinItemsPopulate === 'all' || (!neverPopulate && !ignoreMinItemsFlagSet);
  const computeSkipPopulate = arrayMinItemsStateBehavior?.computeSkipPopulate ?? (() => false);
  const isSkipEmptyDefaults = experimental_defaultFormStateBehavior?.emptyObjectFields === 'skipEmptyDefaults';

  const emptyDefault: T[] | undefined = isSkipEmptyDefaults ? undefined : [];

  // Inject defaults into existing array defaults
  if (Array.isArray(defaults)) {
    defaults = defaults.map((item, idx) => {
      const schemaItem: S = getInnerSchemaForArrayItem<S>(schema, AdditionalItemsHandling.Fallback, idx);
      return computeDefaults<T, S, F>(validator, schemaItem, {
        rootSchema,
        _recurseList,
        experimental_defaultFormStateBehavior,
        experimental_customMergeAllOf,
        parentDefaults: item,
        required,
        shouldMergeDefaultsIntoFormData,
        initialDefaultsGenerated,
      });
    }) as T[];
  }

  // Deeply inject defaults into already existing form data
  if (Array.isArray(rawFormData)) {
    const schemaItem: S = getInnerSchemaForArrayItem<S>(schema);
    if (neverPopulate) {
      defaults = rawFormData as typeof defaults;
    } else {
      const itemDefaults = rawFormData.map((item: T, idx: number) => {
        return computeDefaults<T, S, F>(validator, schemaItem, {
          rootSchema,
          _recurseList,
          experimental_defaultFormStateBehavior,
          experimental_customMergeAllOf,
          rawFormData: item,
          parentDefaults: get(defaults, [idx]),
          required,
          shouldMergeDefaultsIntoFormData,
          initialDefaultsGenerated,
        });
      }) as T[];

      // If the populate 'requiredOnly' flag is set then we only merge and include extra defaults if they are required.
      // Or if populate 'all' is set we merge and include extra defaults.
      const mergeExtraDefaults = ((ignoreMinItemsFlagSet && required) || isPopulateAll) && arrayMergeExtraDefaults;
      defaults = mergeDefaultsWithFormData(defaults, itemDefaults, mergeExtraDefaults);
    }
  }

  // Check if the schema has a const property defined AND we are supporting const as defaults, then we should always
  // return the computedDefault since it's coming from the const.
  const hasConst =
    isObject(schema) && CONST_KEY in schema && experimental_defaultFormStateBehavior?.constAsDefaults !== 'never';
  if (hasConst === false) {
    if (neverPopulate) {
      return defaults ?? emptyDefault;
    }
    if (ignoreMinItemsFlagSet && !required) {
      // If no form data exists or defaults are set leave the field empty/non-existent, otherwise
      // return form data/defaults
      return defaults ? defaults : undefined;
    }
  }

  let arrayDefault: T[] | undefined;
  const defaultsLength = Array.isArray(defaults) ? defaults.length : 0;
  if (
    !schema.minItems ||
    isMultiSelect<T, S, F>(validator, schema, rootSchema, experimental_customMergeAllOf) ||
    computeSkipPopulate<T, S, F>(validator, schema, rootSchema) ||
    schema.minItems <= defaultsLength
  ) {
    // we don't want undefined defaults unless it is both not required or not required as root
    arrayDefault = defaults || (!required && !requiredAsRoot) ? defaults : emptyDefault;
  } else {
    const defaultEntries: T[] = (defaults || []) as T[];
    const fillerSchema: S = getInnerSchemaForArrayItem<S>(schema, AdditionalItemsHandling.Invert);
    const fillerDefault = fillerSchema.default;

    // Calculate filler entries for remaining items (minItems - existing raw data/defaults)
    const fillerEntries: T[] = Array.from({ length: schema.minItems - defaultsLength }, () =>
      computeDefaults<any, S, F>(validator, fillerSchema, {
        parentDefaults: fillerDefault,
        rootSchema,
        _recurseList,
        experimental_defaultFormStateBehavior,
        experimental_customMergeAllOf,
        required,
        shouldMergeDefaultsIntoFormData,
      }),
    ) as T[];
    // then fill up the rest with either the item default or empty, up to minItems
    arrayDefault = defaultEntries.concat(fillerEntries);
  }

  return computeDefaultBasedOnSchemaTypeAndDefaults<T[] | undefined, S>(rawSchema, arrayDefault);
}

/** Computes the default value based on the schema type.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be used when necessary
 * @param rawSchema - The schema for which the default state is desired
 * @param {ComputeDefaultsProps} computeDefaultsProps - Optional props for this function
 * @param defaults - Optional props for this function
 * @returns - The default value based on the schema type if they are defined for object or array schemas.
 */
export function getDefaultBasedOnSchemaType<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rawSchema: S,
  computeDefaultsProps: ComputeDefaultsProps<T, S> = {},
  defaults?: T | T[] | undefined,
): T | T[] | void {
  switch (getSchemaType<S>(rawSchema)) {
    // We need to recurse for object schema inner default values.
    case 'object': {
      return getObjectDefaults(validator, rawSchema, computeDefaultsProps, defaults);
    }
    case 'array': {
      return getArrayDefaults(validator, rawSchema, computeDefaultsProps, defaults as T[]);
    }
  }
}

/** Returns the superset of `formData` that includes the given set updated to include any missing fields that have
 * computed to have defaults provided in the `schema`.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param theSchema - The schema for which the default state is desired
 * @param [formData] - The current formData, if any, onto which to provide any missing defaults
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [includeUndefinedValues=false] - Optional flag, if true, cause undefined values to be added as defaults.
 *          If "excludeObjectChildren", cause undefined values for this object and pass `includeUndefinedValues` as
 *          false when computing defaults for any nested object properties.
 * @param [experimental_defaultFormStateBehavior] Optional configuration object, if provided, allows users to override default form state behavior
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @param initialDefaultsGenerated - Optional flag, indicates whether or not initial defaults have been generated
 * @returns - The resulting `formData` with all the defaults provided
 */
export default function getDefaultFormState<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  theSchema: S,
  formData?: T,
  rootSchema?: S,
  includeUndefinedValues: boolean | 'excludeObjectChildren' = false,
  experimental_defaultFormStateBehavior?: Experimental_DefaultFormStateBehavior,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  initialDefaultsGenerated?: boolean,
) {
  if (!isObject(theSchema)) {
    throw new Error('Invalid schema: ' + theSchema);
  }
  const schema = retrieveSchema<T, S, F>(validator, theSchema, rootSchema, formData, experimental_customMergeAllOf);

  // Get the computed defaults with 'shouldMergeDefaultsIntoFormData' set to true to merge defaults into formData.
  // This is done when for example the value from formData does not exist in the schema 'enum' property, in such
  // cases we take the value from the defaults because the value from the formData is not valid.
  const defaults = computeDefaults<T, S, F>(validator, schema, {
    rootSchema,
    includeUndefinedValues,
    experimental_defaultFormStateBehavior,
    experimental_customMergeAllOf,
    rawFormData: formData,
    shouldMergeDefaultsIntoFormData: true,
    initialDefaultsGenerated,
    requiredAsRoot: true,
  });

  if (schema.type !== 'object' && isObject(schema.default)) {
    return {
      ...defaults,
      ...formData,
    } as T;
  }

  // If the formData is an object or an array, add additional properties from formData and override formData with
  // defaults since the defaults are already merged with formData.
  if (isObject(formData) || Array.isArray(formData)) {
    const { mergeDefaultsIntoFormData } = experimental_defaultFormStateBehavior || {};
    const defaultSupercedesUndefined = mergeDefaultsIntoFormData === 'useDefaultIfFormDataUndefined';
    const result = mergeDefaultsWithFormData<T | T[]>(
      defaults,
      formData,
      true, // set to true to add any additional default array entries.
      defaultSupercedesUndefined,
      true, // set to true to override formData with defaults if they exist.
    );
    return result;
  }

  return defaults;
}
