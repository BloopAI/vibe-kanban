import { FormContextType, RJSFSchema, Widget, RegistryWidgetsType, StrictRJSFSchema } from './types.js';
/** Given a schema representing a field to render and either the name or actual `Widget` implementation, returns the
 * React component that is used to render the widget. If the `widget` is already a React component, then it is wrapped
 * with a `MergedWidget`. Otherwise an attempt is made to look up the widget inside of the `registeredWidgets` map based
 * on the schema type and `widget` name. If no widget component can be found an `Error` is thrown.
 *
 * @param schema - The schema for the field
 * @param [widget] - Either the name of the widget OR a `Widget` implementation to use
 * @param [registeredWidgets={}] - A registry of widget name to `Widget` implementation
 * @returns - The `Widget` component to use
 * @throws - An error if there is no `Widget` component that can be returned
 */
export default function getWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(schema: RJSFSchema, widget?: Widget<T, S, F> | string, registeredWidgets?: RegistryWidgetsType<T, S, F>): Widget<T, S, F>;
