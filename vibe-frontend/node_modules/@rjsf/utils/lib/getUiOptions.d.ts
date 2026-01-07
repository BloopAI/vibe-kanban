import { FormContextType, GlobalUISchemaOptions, RJSFSchema, StrictRJSFSchema, UIOptionsType, UiSchema } from './types.js';
/** Get all passed options from ui:options, and ui:<optionName>, returning them in an object with the `ui:`
 * stripped off. Any `globalOptions` will always be returned, unless they are overridden by options in the `uiSchema`.
 *
 * @param [uiSchema={}] - The UI Schema from which to get any `ui:xxx` options
 * @param [globalOptions={}] - The optional Global UI Schema from which to get any fallback `xxx` options
 * @returns - An object containing all the `ui:xxx` options with the `ui:` stripped off along with all `globalOptions`
 */
export default function getUiOptions<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(uiSchema?: UiSchema<T, S, F>, globalOptions?: GlobalUISchemaOptions): UIOptionsType<T, S, F>;
