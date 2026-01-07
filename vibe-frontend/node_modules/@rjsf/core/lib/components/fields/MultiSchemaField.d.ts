import { Component } from 'react';
import { FieldProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** Type used for the state of the `AnyOfField` component */
type AnyOfFieldState<S extends StrictRJSFSchema = RJSFSchema> = {
    /** The currently selected option */
    selectedOption: number;
    /** The option schemas after retrieving all $refs */
    retrievedOptions: S[];
};
/** The `AnyOfField` component is used to render a field in the schema that is an `anyOf`, `allOf` or `oneOf`. It tracks
 * the currently selected option and cleans up any irrelevant data in `formData`.
 *
 * @param props - The `FieldProps` for this template
 */
declare class AnyOfField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> extends Component<FieldProps<T, S, F>, AnyOfFieldState<S>> {
    /** Constructs an `AnyOfField` with the given `props` to initialize the initially selected option in state
     *
     * @param props - The `FieldProps` for this template
     */
    constructor(props: FieldProps<T, S, F>);
    /** React lifecycle method that is called when the props and/or state for this component is updated. It recomputes the
     * currently selected option based on the overall `formData`
     *
     * @param prevProps - The previous `FieldProps` for this template
     * @param prevState - The previous `AnyOfFieldState` for this template
     */
    componentDidUpdate(prevProps: Readonly<FieldProps<T, S, F>>, prevState: Readonly<AnyOfFieldState>): void;
    /** Determines the best matching option for the given `formData` and `options`.
     *
     * @param formData - The new formData
     * @param options - The list of options to choose from
     * @return - The index of the `option` that best matches the `formData`
     */
    getMatchingOption(selectedOption: number, formData: T | undefined, options: S[]): number;
    /** Callback handler to remember what the currently selected option is. In addition to that the `formData` is updated
     * to remove properties that are not part of the newly selected option schema, and then the updated data is passed to
     * the `onChange` handler.
     *
     * @param option - The new option value being selected
     */
    onOptionChange: (option?: string) => void;
    getFieldId(): string;
    /** Renders the `AnyOfField` selector along with a `SchemaField` for the value of the `formData`
     */
    render(): import("react/jsx-runtime").JSX.Element;
}
export default AnyOfField;
//# sourceMappingURL=MultiSchemaField.d.ts.map