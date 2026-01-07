import { FormContextType, TitleFieldProps, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

const REQUIRED_FIELD_SYMBOL = '*';

/** The `TitleField` is the template to use to render the title of a field
 *
 * @param props - The `TitleFieldProps` for this component
 */
export default function TitleField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: TitleFieldProps<T, S, F>,
) {
  const { id, title, required, optionalDataControl } = props;
  return (
    <legend id={id}>
      {title}
      {required && <span className='required'>{REQUIRED_FIELD_SYMBOL}</span>}
      {optionalDataControl && (
        <span className='pull-right' style={{ marginBottom: '2px' }}>
          {optionalDataControl}
        </span>
      )}
    </legend>
  );
}
