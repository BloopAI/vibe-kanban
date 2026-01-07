import { getTemplate, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `ColorWidget` component uses the `BaseInputTemplate` changing the type to `color` and disables it when it is
 * either disabled or readonly.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function ColorWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { disabled, readonly, options, registry } = props;
  const BaseInputTemplate = getTemplate<'BaseInputTemplate', T, S, F>('BaseInputTemplate', registry, options);
  return <BaseInputTemplate type='color' {...props} disabled={disabled || readonly} />;
}
