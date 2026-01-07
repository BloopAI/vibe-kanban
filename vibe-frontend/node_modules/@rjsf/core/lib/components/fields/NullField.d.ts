import { FieldProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The `NullField` component is used to render a field in the schema is null. It also ensures that the `formData` is
 * also set to null if it has no value.
 *
 * @param props - The `FieldProps` for this template
 */
declare function NullField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(props: FieldProps<T, S, F>): null;
export default NullField;
//# sourceMappingURL=NullField.d.ts.map