import { useEffect } from 'react';
import { FieldProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

/** The `NullField` component is used to render a field in the schema is null. It also ensures that the `formData` is
 * also set to null if it has no value.
 *
 * @param props - The `FieldProps` for this template
 */
function NullField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: FieldProps<T, S, F>,
) {
  const { formData, onChange, fieldPathId } = props;
  useEffect(() => {
    if (formData === undefined) {
      onChange(null as unknown as T, fieldPathId.path);
    }
  }, [fieldPathId, formData, onChange]);

  return null;
}

export default NullField;
