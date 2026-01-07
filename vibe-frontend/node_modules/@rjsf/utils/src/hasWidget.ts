import getWidget from './getWidget';
import { FormContextType, RegistryWidgetsType, RJSFSchema, StrictRJSFSchema, Widget } from './types';

/** Detects whether the `widget` exists for the `schema` with the associated `registryWidgets` and returns true if it
 * does, or false if it doesn't.
 *
 * @param schema - The schema for the field
 * @param widget - Either the name of the widget OR a `Widget` implementation to use
 * @param [registeredWidgets={}] - A registry of widget name to `Widget` implementation
 * @returns - True if the widget exists, false otherwise
 */
export default function hasWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  schema: RJSFSchema,
  widget: Widget<T, S, F> | string,
  registeredWidgets: RegistryWidgetsType<T, S, F> = {},
) {
  try {
    getWidget(schema, widget, registeredWidgets);
    return true;
  } catch (e) {
    const err: Error = e as Error;
    if (err.message && (err.message.startsWith('No widget') || err.message.startsWith('Unsupported widget'))) {
      return false;
    }
    throw e;
  }
}
