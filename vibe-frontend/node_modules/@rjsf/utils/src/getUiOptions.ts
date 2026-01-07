import { UI_OPTIONS_KEY, UI_WIDGET_KEY } from './constants';
import isObject from './isObject';
import { FormContextType, GlobalUISchemaOptions, RJSFSchema, StrictRJSFSchema, UIOptionsType, UiSchema } from './types';

/** Get all passed options from ui:options, and ui:<optionName>, returning them in an object with the `ui:`
 * stripped off. Any `globalOptions` will always be returned, unless they are overridden by options in the `uiSchema`.
 *
 * @param [uiSchema={}] - The UI Schema from which to get any `ui:xxx` options
 * @param [globalOptions={}] - The optional Global UI Schema from which to get any fallback `xxx` options
 * @returns - An object containing all the `ui:xxx` options with the `ui:` stripped off along with all `globalOptions`
 */
export default function getUiOptions<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  uiSchema: UiSchema<T, S, F> = {},
  globalOptions: GlobalUISchemaOptions = {},
): UIOptionsType<T, S, F> {
  // Handle null or undefined uiSchema
  if (!uiSchema) {
    return { ...globalOptions };
  }
  return Object.keys(uiSchema)
    .filter((key) => key.indexOf('ui:') === 0)
    .reduce(
      (options, key) => {
        const value = uiSchema[key];
        if (key === UI_WIDGET_KEY && isObject(value)) {
          console.error('Setting options via ui:widget object is no longer supported, use ui:options instead');
          return options;
        }
        if (key === UI_OPTIONS_KEY && isObject(value)) {
          return { ...options, ...value };
        }
        return { ...options, [key.substring(3)]: value };
      },
      { ...globalOptions },
    );
}
