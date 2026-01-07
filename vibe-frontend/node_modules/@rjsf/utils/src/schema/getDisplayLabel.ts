import get from 'lodash/get';

import { ADDITIONAL_PROPERTY_FLAG, UI_FIELD_KEY, UI_WIDGET_KEY } from '../constants';
import getSchemaType from '../getSchemaType';
import getUiOptions from '../getUiOptions';
import isCustomWidget from '../isCustomWidget';
import {
  FormContextType,
  GlobalUISchemaOptions,
  RJSFSchema,
  StrictRJSFSchema,
  UiSchema,
  ValidatorType,
  Experimental_CustomMergeAllOf,
} from '../types';
import isFilesArray from './isFilesArray';
import isMultiSelect from './isMultiSelect';

/** Determines whether the combination of `schema` and `uiSchema` properties indicates that the label for the `schema`
 * should be displayed in a UI.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param schema - The schema for which the display label flag is desired
 * @param [uiSchema={}] - The UI schema from which to derive potentially displayable information
 * @param [rootSchema] - The root schema, used to primarily to look up `$ref`s
 * @param [globalOptions={}] - The optional Global UI Schema from which to get any fallback `xxx` options
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - True if the label should be displayed or false if it should not
 */
export default function getDisplayLabel<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  validator: ValidatorType<T, S, F>,
  schema: S,
  uiSchema: UiSchema<T, S, F> = {},
  rootSchema?: S,
  globalOptions?: GlobalUISchemaOptions,
  experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>,
): boolean {
  const uiOptions = getUiOptions<T, S, F>(uiSchema, globalOptions);
  const { label = true } = uiOptions;
  let displayLabel = Boolean(label);
  if (displayLabel) {
    const schemaType = getSchemaType<S>(schema);
    const addedByAdditionalProperty = get(schema, ADDITIONAL_PROPERTY_FLAG, false);

    if (schemaType === 'array') {
      displayLabel =
        addedByAdditionalProperty ||
        isMultiSelect<T, S, F>(validator, schema, rootSchema, experimental_customMergeAllOf) ||
        isFilesArray<T, S, F>(validator, schema, uiSchema, rootSchema, experimental_customMergeAllOf) ||
        isCustomWidget(uiSchema);
    }

    if (schemaType === 'object') {
      displayLabel = addedByAdditionalProperty;
    }
    if (schemaType === 'boolean' && uiSchema && !uiSchema[UI_WIDGET_KEY]) {
      displayLabel = false;
    }
    if (uiSchema && uiSchema[UI_FIELD_KEY]) {
      displayLabel = false;
    }
  }
  return displayLabel;
}
