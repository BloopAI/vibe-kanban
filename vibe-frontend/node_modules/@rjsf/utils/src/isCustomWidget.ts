import getUiOptions from './getUiOptions';
import { FormContextType, RJSFSchema, StrictRJSFSchema, UiSchema } from './types';

/** Checks to see if the `uiSchema` contains the `widget` field and that the widget is not `hidden`
 *
 * @param uiSchema - The UI Schema from which to detect if it is customized
 * @returns - True if the `uiSchema` describes a custom widget, false otherwise
 */
export default function isCustomWidget<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(uiSchema: UiSchema<T, S, F> = {}) {
  return (
    // TODO: Remove the `&& uiSchema['ui:widget'] !== 'hidden'` once we support hidden widgets for arrays.
    // https://rjsf-team.github.io/react-jsonschema-form/docs/usage/widgets/#hidden-widgets
    'widget' in getUiOptions<T, S, F>(uiSchema) && getUiOptions<T, S, F>(uiSchema)['widget'] !== 'hidden'
  );
}
