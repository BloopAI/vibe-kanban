import { useCallback } from 'react';
import { getTemplate, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `TimeWidget` component uses the `BaseInputTemplate` changing the type to `time` and transforms
 * the value to undefined when it is falsy during the `onChange` handling.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function TimeWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { onChange, options, registry } = props;
  const BaseInputTemplate = getTemplate<'BaseInputTemplate', T, S, F>('BaseInputTemplate', registry, options);
  const handleChange = useCallback((value: any) => onChange(value ? `${value}:00` : undefined), [onChange]);

  return <BaseInputTemplate type='time' {...props} onChange={handleChange} />;
}
