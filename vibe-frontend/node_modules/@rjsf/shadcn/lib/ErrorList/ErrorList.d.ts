import { ErrorListProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';
/** The `ErrorList` component is the template that renders the all the errors associated with the fields in the `Form`
 *
 * @param props - The `ErrorListProps` for this component
 */
export default function ErrorList<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({ errors, registry, }: ErrorListProps<T, S, F>): import("react/jsx-runtime").JSX.Element;
