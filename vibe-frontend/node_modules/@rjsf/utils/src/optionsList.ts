import get from 'lodash/get';

import { CONST_KEY, DEFAULT_KEY, PROPERTIES_KEY } from './constants';
import getDiscriminatorFieldFromSchema from './getDiscriminatorFieldFromSchema';
import getUiOptions from './getUiOptions';
import toConstant from './toConstant';
import { RJSFSchema, EnumOptionsType, StrictRJSFSchema, FormContextType, UiSchema } from './types';

/** Gets the list of options from the `schema`. If the schema has an enum list, then those enum values are returned. The
 * label will be the same as the `value`.
 *
 * If the schema has a `oneOf` or `anyOf`, then the value is the list of either:
 * - The `const` values from the schema if present
 * - If the schema has a discriminator and the label using either the `schema.title` or the value. If a `uiSchema` is
 * provided, and it has the `ui:enumNames` matched with `enum` or it has an associated `oneOf` or `anyOf` with a list of
 * objects containing `ui:title` then the UI schema values will replace the values from the schema.
 *
 * @param schema - The schema from which to extract the options list
 * @param [uiSchema] - The optional uiSchema from which to get alternate labels for the options
 * @returns - The list of options from the schema
 */
export default function optionsList<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  schema: S,
  uiSchema?: UiSchema<T, S, F>,
): EnumOptionsType<S>[] | undefined {
  if (schema.enum) {
    let enumNames: string[] | undefined;
    if (uiSchema) {
      const { enumNames: uiEnumNames } = getUiOptions<T, S, F>(uiSchema);
      enumNames = uiEnumNames;
    }
    return schema.enum.map((value, i) => {
      const label = enumNames?.[i] || String(value);
      return { label, value };
    });
  }
  let altSchemas: S['anyOf'] | S['oneOf'] = undefined;
  let altUiSchemas: UiSchema<T, S, F> | undefined = undefined;
  if (schema.anyOf) {
    altSchemas = schema.anyOf;
    altUiSchemas = uiSchema?.anyOf;
  } else if (schema.oneOf) {
    altSchemas = schema.oneOf;
    altUiSchemas = uiSchema?.oneOf;
  }
  // See if there is a discriminator path specified in the schema, and if so, use it as the selectorField, otherwise
  // pull one from the uiSchema
  let selectorField = getDiscriminatorFieldFromSchema<S>(schema);
  if (uiSchema) {
    const { optionsSchemaSelector = selectorField } = getUiOptions<T, S, F>(uiSchema);
    selectorField = optionsSchemaSelector;
  }
  return (
    altSchemas &&
    altSchemas.map((aSchemaDef, index) => {
      const { title } = getUiOptions<T, S, F>(altUiSchemas?.[index]);
      const aSchema = aSchemaDef as S;
      let value: EnumOptionsType<S>['value'];
      let label = title;
      if (selectorField) {
        const innerSchema: S = get(aSchema, [PROPERTIES_KEY, selectorField], {}) as S;
        value = get(innerSchema, DEFAULT_KEY, get(innerSchema, CONST_KEY));
        label = label || innerSchema?.title || aSchema.title || String(value);
      } else {
        value = toConstant(aSchema);
        label = label || aSchema.title || String(value);
      }
      return {
        schema: aSchema,
        label,
        value,
      };
    })
  );
}
