import isObject from 'lodash/isObject';
import uniq from 'lodash/uniq';

import { FormContextType, Registry, RJSFSchema, StrictRJSFSchema, UiSchema } from './types';
import getSchemaType from './getSchemaType';
import getUiOptions from './getUiOptions';
import isRootSchema from './isRootSchema';
import { ANY_OF_KEY, ONE_OF_KEY } from './constants';

/** Returns the unique list of schema types for all of the options in a anyOf/oneOf
 *
 * @param schemas - The list of schemas representing the XxxOf options
 * @returns - All of the unique types contained within the oneOf list
 */
export function getSchemaTypesForXxxOf<S extends StrictRJSFSchema = RJSFSchema>(schemas: S[]): string | string[] {
  const allTypes: string[] = uniq(
    schemas
      .map((s) => (isObject(s) ? getSchemaType(s) : undefined))
      .flat()
      .filter((t) => t !== undefined),
  );
  return allTypes.length === 1 ? allTypes[0] : allTypes;
}

/** Determines whether the field information from the combination of `schema` and `required` along with the
 * `enableOptionalDataFieldForType` settings from the global UI options in the `registry` all indicate that this field
 * should be rendered with the Optional Data Controls UI.
 *
 * @param registry - The `registry` object
 * @param schema - The schema for the field
 * @param required - Flag indicating whether the field is required
 * @param [uiSchema] - The uiSchema for the field
 * @return - True if the field should be rendered with the optional field UI, otherwise false
 */
export default function shouldRenderOptionalField<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(registry: Registry<T, S, F>, schema: S, required: boolean, uiSchema?: UiSchema<T, S, F>): boolean {
  const { enableOptionalDataFieldForType = [] } = getUiOptions<T, S, F>(uiSchema, registry.globalUiOptions);
  let schemaType: ReturnType<typeof getSchemaType<S>>;
  if (ANY_OF_KEY in schema && Array.isArray(schema[ANY_OF_KEY])) {
    schemaType = getSchemaTypesForXxxOf<S>(schema[ANY_OF_KEY] as S[]);
  } else if (ONE_OF_KEY in schema && Array.isArray(schema[ONE_OF_KEY])) {
    schemaType = getSchemaTypesForXxxOf<S>(schema[ONE_OF_KEY] as S[]);
  } else {
    schemaType = getSchemaType<S>(schema);
  }
  return (
    !isRootSchema<T, S, F>(registry, schema) &&
    !required &&
    !!schemaType &&
    !Array.isArray(schemaType) &&
    !!enableOptionalDataFieldForType.find((val) => val === schemaType)
  );
}
