import { BaseInputTemplateProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The `BaseInputTemplate` is the template to use to render the basic `<input>` component for the `core` theme.
 * It is used as the template for rendering many of the <input> based widgets that differ by `type` and callbacks only.
 * It can be customized/overridden for other themes or individual implementations as needed.
 *
 * @param props - The `WidgetProps` for this template
 */
export default function BaseInputTemplate<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(props: BaseInputTemplateProps<T, S, F>): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=BaseInputTemplate.d.ts.map