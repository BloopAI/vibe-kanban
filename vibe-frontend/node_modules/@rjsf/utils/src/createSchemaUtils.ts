import deepEquals from './deepEquals';
import {
  Experimental_CustomMergeAllOf,
  Experimental_DefaultFormStateBehavior,
  FormContextType,
  FoundFieldType,
  GlobalUISchemaOptions,
  PathSchema,
  RJSFSchema,
  SchemaUtilsType,
  StrictRJSFSchema,
  UiSchema,
  ValidatorType,
} from './types';
import {
  findFieldInSchema,
  findSelectedOptionInXxxOf,
  getDefaultFormState,
  getDisplayLabel,
  getClosestMatchingOption,
  getFirstMatchingOption,
  getFromSchema,
  isFilesArray,
  isMultiSelect,
  isSelect,
  retrieveSchema,
  sanitizeDataForNewSchema,
  toPathSchema,
} from './schema';
import { makeAllReferencesAbsolute } from './findSchemaDefinition';
import { ID_KEY, JSON_SCHEMA_DRAFT_2020_12, SCHEMA_KEY } from './constants';
import get from 'lodash/get';

/** The `SchemaUtils` class provides a wrapper around the publicly exported APIs in the `utils/schema` directory such
 * that one does not have to explicitly pass the `validator`, `rootSchema`, `experimental_defaultFormStateBehavior` or
 * `experimental_customMergeAllOf` to each method. Since these generally do not change across a `Form`, this allows for
 * providing a simplified set of APIs to the `@rjsf/core` components and the various themes as well. This class
 * implements the `SchemaUtilsType` interface.
 */
class SchemaUtils<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>
  implements SchemaUtilsType<T, S, F>
{
  rootSchema: S;
  validator: ValidatorType<T, S, F>;
  experimental_defaultFormStateBehavior: Experimental_DefaultFormStateBehavior;
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>;

  /** Constructs the `SchemaUtils` instance with the given `validator` and `rootSchema` stored as instance variables
   *
   * @param validator - An implementation of the `ValidatorType` interface that will be forwarded to all the APIs
   * @param rootSchema - The root schema that will be forwarded to all the APIs
   * @param experimental_defaultFormStateBehavior - Configuration flags to allow users to override default form state behavior
   * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
   */
  constructor(
    validator: ValidatorType<T, S, F>,
    rootSchema: S,
    experimental_defaultFormStateBehavior: Experimental_DefaultFormStateBehavior,
    experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  ) {
    if (rootSchema && rootSchema[SCHEMA_KEY] === JSON_SCHEMA_DRAFT_2020_12) {
      this.rootSchema = makeAllReferencesAbsolute(rootSchema, get(rootSchema, ID_KEY, '#'));
    } else {
      this.rootSchema = rootSchema;
    }
    this.validator = validator;
    this.experimental_defaultFormStateBehavior = experimental_defaultFormStateBehavior;
    this.experimental_customMergeAllOf = experimental_customMergeAllOf;
  }

  /** Returns the `rootSchema` in the `SchemaUtilsType`
   *
   * @returns - The `rootSchema`
   */
  getRootSchema() {
    return this.rootSchema;
  }

  /** Returns the `ValidatorType` in the `SchemaUtilsType`
   *
   * @returns - The `ValidatorType`
   */
  getValidator() {
    return this.validator;
  }

  /** Determines whether either the `validator` and `rootSchema` differ from the ones associated with this instance of
   * the `SchemaUtilsType`. If either `validator` or `rootSchema` are falsy, then return false to prevent the creation
   * of a new `SchemaUtilsType` with incomplete properties.
   *
   * @param validator - An implementation of the `ValidatorType` interface that will be compared against the current one
   * @param rootSchema - The root schema that will be compared against the current one
   * @param [experimental_defaultFormStateBehavior] Optional configuration object, if provided, allows users to override default form state behavior
   * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
   * @returns - True if the `SchemaUtilsType` differs from the given `validator` or `rootSchema`
   */
  doesSchemaUtilsDiffer(
    validator: ValidatorType<T, S, F>,
    rootSchema: S,
    experimental_defaultFormStateBehavior = {},
    experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
  ): boolean {
    // If either validator or rootSchema are falsy, return false to prevent the creation
    // of a new SchemaUtilsType with incomplete properties.
    if (!validator || !rootSchema) {
      return false;
    }

    return (
      this.validator !== validator ||
      !deepEquals(this.rootSchema, rootSchema) ||
      !deepEquals(this.experimental_defaultFormStateBehavior, experimental_defaultFormStateBehavior) ||
      this.experimental_customMergeAllOf !== experimental_customMergeAllOf
    );
  }

  /** Finds the field specified by the `path` within the root or recursed `schema`. If there is no field for the specified
   * `path`, then the default `{ field: undefined, isRequired: undefined }` is returned. It determines whether a leaf
   * field is in the `required` list for its parent and if so, it is marked as required on return.
   *
   * @param schema - The current node within the JSON schema
   * @param path - The remaining keys in the path to the desired field
   * @param [formData] - The form data that is used to determine which oneOf option
   * @returns - An object that contains the field and its required state. If no field can be found then
   *            `{ field: undefined, isRequired: undefined }` is returned.
   */
  findFieldInSchema(schema: S, path: string | string[], formData?: T): FoundFieldType<S> {
    return findFieldInSchema(
      this.validator,
      this.rootSchema,
      schema,
      path,
      formData,
      this.experimental_customMergeAllOf,
    );
  }

  /** Finds the oneOf option inside the `schema['any/oneOf']` list which has the `properties[selectorField].default` that
   * matches the `formData[selectorField]` value. For the purposes of this function, `selectorField` is either
   * `schema.discriminator.propertyName` or `fallbackField`.
   *
   * @param schema - The schema element in which to search for the selected oneOf option
   * @param fallbackField - The field to use as a backup selector field if the schema does not have a required field
   * @param xxx - Either `oneOf` or `anyOf`, defines which value is being sought
   * @param [formData={}] - The form data that is used to determine which oneOf option
   * @returns - The anyOf/oneOf option that matches the selector field in the schema or undefined if nothing is selected
   */
  findSelectedOptionInXxxOf(schema: S, fallbackField: string, xxx: 'anyOf' | `oneOf`, formData: T): S | undefined {
    return findSelectedOptionInXxxOf(
      this.validator,
      this.rootSchema,
      schema,
      fallbackField,
      xxx,
      formData,
      this.experimental_customMergeAllOf,
    );
  }

  /** Returns the superset of `formData` that includes the given set updated to include any missing fields that have
   * computed to have defaults provided in the `schema`.
   *
   * @param schema - The schema for which the default state is desired
   * @param [formData] - The current formData, if any, onto which to provide any missing defaults
   * @param [includeUndefinedValues=false] - Optional flag, if true, cause undefined values to be added as defaults.
   *          If "excludeObjectChildren", pass `includeUndefinedValues` as false when computing defaults for any nested
   *          object properties.
   * @param initialDefaultsGenerated - Indicates whether or not initial defaults have been generated
   * @returns - The resulting `formData` with all the defaults provided
   */
  getDefaultFormState(
    schema: S,
    formData?: T,
    includeUndefinedValues: boolean | 'excludeObjectChildren' = false,
    initialDefaultsGenerated?: boolean,
  ): T | T[] | undefined {
    return getDefaultFormState<T, S, F>(
      this.validator,
      schema,
      formData,
      this.rootSchema,
      includeUndefinedValues,
      this.experimental_defaultFormStateBehavior,
      this.experimental_customMergeAllOf,
      initialDefaultsGenerated,
    );
  }

  /** Determines whether the combination of `schema` and `uiSchema` properties indicates that the label for the `schema`
   * should be displayed in a UI.
   *
   * @param schema - The schema for which the display label flag is desired
   * @param [uiSchema] - The UI schema from which to derive potentially displayable information
   * @param [globalOptions={}] - The optional Global UI Schema from which to get any fallback `xxx` options
   * @returns - True if the label should be displayed or false if it should not
   */
  getDisplayLabel(schema: S, uiSchema?: UiSchema<T, S, F>, globalOptions?: GlobalUISchemaOptions) {
    return getDisplayLabel<T, S, F>(
      this.validator,
      schema,
      uiSchema,
      this.rootSchema,
      globalOptions,
      this.experimental_customMergeAllOf,
    );
  }

  /** Determines which of the given `options` provided most closely matches the `formData`.
   * Returns the index of the option that is valid and is the closest match, or 0 if there is no match.
   *
   * The closest match is determined using the number of matching properties, and more heavily favors options with
   * matching readOnly, default, or const values.
   *
   * @param formData - The form data associated with the schema
   * @param options - The list of options that can be selected from
   * @param [selectedOption] - The index of the currently selected option, defaulted to -1 if not specified
   * @param [discriminatorField] - The optional name of the field within the options object whose value is used to
   *          determine which option is selected
   * @returns - The index of the option that is the closest match to the `formData` or the `selectedOption` if no match
   */
  getClosestMatchingOption(
    formData: T | undefined,
    options: S[],
    selectedOption?: number,
    discriminatorField?: string,
  ): number {
    return getClosestMatchingOption<T, S, F>(
      this.validator,
      this.rootSchema,
      formData,
      options,
      selectedOption,
      discriminatorField,
      this.experimental_customMergeAllOf,
    );
  }

  /** Given the `formData` and list of `options`, attempts to find the index of the first option that matches the data.
   * Always returns the first option if there is nothing that matches.
   *
   * @param formData - The current formData, if any, used to figure out a match
   * @param options - The list of options to find a matching options from
   * @param [discriminatorField] - The optional name of the field within the options object whose value is used to
   *          determine which option is selected
   * @returns - The firstindex of the matched option or 0 if none is available
   */
  getFirstMatchingOption(formData: T | undefined, options: S[], discriminatorField?: string): number {
    return getFirstMatchingOption<T, S, F>(this.validator, formData, options, this.rootSchema, discriminatorField);
  }

  /** Helper that acts like lodash's `get` but additionally retrieves `$ref`s as needed to get the path for schemas
   * containing potentially nested `$ref`s.
   *
   * @param schema - The current node within the JSON schema recursion
   * @param path - The remaining keys in the path to the desired property
   * @param defaultValue - The value to return if a value is not found for the `pathList` path
   * @returns - The internal schema from the `schema` for the given `path` or the `defaultValue` if not found
   */
  getFromSchema(schema: S, path: string | string[], defaultValue: T): T;
  getFromSchema(schema: S, path: string | string[], defaultValue: S): S;
  getFromSchema(schema: S, path: string | string[], defaultValue: T | S): T | S {
    return getFromSchema<T, S, F>(
      this.validator,
      this.rootSchema,
      schema,
      path,
      // @ts-expect-error TS2769: No overload matches this call
      defaultValue,
      this.experimental_customMergeAllOf,
    );
  }

  /** Checks to see if the `schema` and `uiSchema` combination represents an array of files
   *
   * @param schema - The schema for which check for array of files flag is desired
   * @param [uiSchema] - The UI schema from which to check the widget
   * @returns - True if schema/uiSchema contains an array of files, otherwise false
   */
  isFilesArray(schema: S, uiSchema?: UiSchema<T, S, F>) {
    return isFilesArray<T, S, F>(this.validator, schema, uiSchema, this.rootSchema, this.experimental_customMergeAllOf);
  }

  /** Checks to see if the `schema` combination represents a multi-select
   *
   * @param schema - The schema for which check for a multi-select flag is desired
   * @returns - True if schema contains a multi-select, otherwise false
   */
  isMultiSelect(schema: S) {
    return isMultiSelect<T, S, F>(this.validator, schema, this.rootSchema, this.experimental_customMergeAllOf);
  }

  /** Checks to see if the `schema` combination represents a select
   *
   * @param schema - The schema for which check for a select flag is desired
   * @returns - True if schema contains a select, otherwise false
   */
  isSelect(schema: S) {
    return isSelect<T, S, F>(this.validator, schema, this.rootSchema, this.experimental_customMergeAllOf);
  }

  /** Retrieves an expanded schema that has had all of its conditions, additional properties, references and
   * dependencies resolved and merged into the `schema` given a `rawFormData` that is used to do the potentially
   * recursive resolution.
   *
   * @param schema - The schema for which retrieving a schema is desired
   * @param [rawFormData] - The current formData, if any, to assist retrieving a schema
   * @param [resolveAnyOfOrOneOfRefs] - Optional flag indicating whether to resolved refs in anyOf/oneOf lists
   * @returns - The schema having its conditions, additional properties, references and dependencies resolved
   */
  retrieveSchema(schema: S, rawFormData?: T, resolveAnyOfOrOneOfRefs?: boolean) {
    return retrieveSchema<T, S, F>(
      this.validator,
      schema,
      this.rootSchema,
      rawFormData,
      this.experimental_customMergeAllOf,
      resolveAnyOfOrOneOfRefs,
    );
  }

  /** Sanitize the `data` associated with the `oldSchema` so it is considered appropriate for the `newSchema`. If the
   * new schema does not contain any properties, then `undefined` is returned to clear all the form data. Due to the
   * nature of schemas, this sanitization happens recursively for nested objects of data. Also, any properties in the
   * old schemas that are non-existent in the new schema are set to `undefined`.
   *
   * @param [newSchema] - The new schema for which the data is being sanitized
   * @param [oldSchema] - The old schema from which the data originated
   * @param [data={}] - The form data associated with the schema, defaulting to an empty object when undefined
   * @returns - The new form data, with all the fields uniquely associated with the old schema set
   *      to `undefined`. Will return `undefined` if the new schema is not an object containing properties.
   */
  sanitizeDataForNewSchema(newSchema?: S, oldSchema?: S, data?: any): T {
    return sanitizeDataForNewSchema(
      this.validator,
      this.rootSchema,
      newSchema,
      oldSchema,
      data,
      this.experimental_customMergeAllOf,
    );
  }

  /** Generates an `PathSchema` object for the `schema`, recursively
   *
   * @param schema - The schema for which the display label flag is desired
   * @param [name] - The base name for the schema
   * @param [formData] - The current formData, if any, onto which to provide any missing defaults
   * @returns - The `PathSchema` object for the `schema`
   */
  toPathSchema(schema: S, name?: string, formData?: T): PathSchema<T> {
    return toPathSchema<T, S, F>(
      this.validator,
      schema,
      name,
      this.rootSchema,
      formData,
      this.experimental_customMergeAllOf,
    );
  }
}

/** Creates a `SchemaUtilsType` interface that is based around the given `validator` and `rootSchema` parameters. The
 * resulting interface implementation will forward the `validator` and `rootSchema` to all the wrapped APIs.
 *
 * @param validator - an implementation of the `ValidatorType` interface that will be forwarded to all the APIs
 * @param rootSchema - The root schema that will be forwarded to all the APIs
 * @param [experimental_defaultFormStateBehavior] Optional configuration object, if provided, allows users to override default form state behavior
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - An implementation of a `SchemaUtilsType` interface
 */
export default function createSchemaUtils<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  rootSchema: S,
  experimental_defaultFormStateBehavior = {},
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): SchemaUtilsType<T, S, F> {
  return new SchemaUtils<T, S, F>(
    validator,
    rootSchema,
    experimental_defaultFormStateBehavior,
    experimental_customMergeAllOf,
  );
}
