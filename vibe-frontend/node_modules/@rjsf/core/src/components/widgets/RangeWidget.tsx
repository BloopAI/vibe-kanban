import { FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from '@rjsf/utils';

/** The `RangeWidget` component uses the `BaseInputTemplate` changing the type to `range` and wrapping the result
 * in a div, with the value along side it.
 *
 * @param props - The `WidgetProps` for this component
 */
export default function RangeWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const {
    value,
    registry: {
      templates: { BaseInputTemplate },
    },
  } = props;
  return (
    <div className='field-range-wrapper'>
      <BaseInputTemplate type='range' {...props} />
      <span className='range-view'>{value}</span>
    </div>
  );
}
