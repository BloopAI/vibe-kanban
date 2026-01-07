import { getTemplate, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `UpDownWidget` component uses the `BaseInputTemplate` changing the type to `number`.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function UpDownWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { options, registry } = props;
  const BaseInputTemplate = getTemplate<'BaseInputTemplate', T, S, F>('BaseInputTemplate', registry, options);
  return <BaseInputTemplate type='number' {...props} />;
}
