import { FormContextType, TemplatesType, Registry, UIOptionsType, StrictRJSFSchema, RJSFSchema } from './types.js';
/** Returns the template with the given `name` from either the `uiSchema` if it is defined or from the `registry`
 * otherwise. NOTE, since `ButtonTemplates` are not overridden in `uiSchema` only those in the `registry` are returned.
 *
 * @param name - The name of the template to fetch, restricted to the keys of `TemplatesType`
 * @param registry - The `Registry` from which to read the template
 * @param [uiOptions={}] - The `UIOptionsType` from which to read an alternate template
 * @returns - The template from either the `uiSchema` or `registry` for the `name`
 */
export default function getTemplate<Name extends keyof TemplatesType<T, S, F>, T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(name: Name, registry: Registry<T, S, F>, uiOptions?: UIOptionsType<T, S, F>): TemplatesType<T, S, F>[Name];
