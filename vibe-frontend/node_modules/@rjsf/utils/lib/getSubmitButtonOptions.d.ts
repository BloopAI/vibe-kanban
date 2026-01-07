import { FormContextType, RJSFSchema, StrictRJSFSchema, UiSchema, UISchemaSubmitButtonOptions } from './types.js';
/** The default submit button options, exported for testing purposes
 */
export declare const DEFAULT_OPTIONS: UISchemaSubmitButtonOptions;
/** Extracts any `ui:submitButtonOptions` from the `uiSchema` and merges them onto the `DEFAULT_OPTIONS`
 *
 * @param [uiSchema={}] - the UI Schema from which to extract submit button props
 * @returns - The merging of the `DEFAULT_OPTIONS` with any custom ones
 */
export default function getSubmitButtonOptions<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(uiSchema?: UiSchema<T, S, F>): UISchemaSubmitButtonOptions;
