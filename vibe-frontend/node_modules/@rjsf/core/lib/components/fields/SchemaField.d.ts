import { Component } from 'react';
import { FieldProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The `SchemaField` component determines whether it is necessary to rerender the component based on any props changes
 * and if so, calls the `SchemaFieldRender` component with the props.
 */
declare class SchemaField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> extends Component<FieldProps<T, S, F>> {
    shouldComponentUpdate(nextProps: Readonly<FieldProps<T, S, F>>): boolean;
    render(): import("react/jsx-runtime").JSX.Element;
}
export default SchemaField;
//# sourceMappingURL=SchemaField.d.ts.map