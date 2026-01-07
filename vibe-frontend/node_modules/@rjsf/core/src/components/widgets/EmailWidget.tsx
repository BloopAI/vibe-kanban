import { getTemplate, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `EmailWidget` component uses the `BaseInputTemplate` changing the type to `email`.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function EmailWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { options, registry } = props;
  const BaseInputTemplate = getTemplate<'BaseInputTemplate', T, S, F>('BaseInputTemplate', registry, options);
  return <BaseInputTemplate type='email' {...props} />;
}
