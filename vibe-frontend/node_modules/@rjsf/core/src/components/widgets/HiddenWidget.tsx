import { FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `HiddenWidget` is a widget for rendering a hidden input field.
 *  It is typically used by setting type to "hidden".
 *
 * @param props - The `WidgetProps` for this component
 */
function HiddenWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  id,
  value,
  htmlName,
}: WidgetProps<T, S, F>) {
  return <input type='hidden' id={id} name={htmlName || id} value={typeof value === 'undefined' ? '' : value} />;
}

export default HiddenWidget;
