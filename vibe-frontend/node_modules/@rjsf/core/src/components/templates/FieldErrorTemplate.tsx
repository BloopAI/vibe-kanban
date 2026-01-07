import { errorId, FieldErrorProps, FormContextType, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

/** The `FieldErrorTemplate` component renders the errors local to the particular field
 *
 * @param props - The `FieldErrorProps` for the errors being rendered
 */
export default function FieldErrorTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: FieldErrorProps<T, S, F>) {
  const { errors = [], fieldPathId } = props;
  if (errors.length === 0) {
    return null;
  }
  const id = errorId(fieldPathId);

  return (
    <div>
      <ul id={id} className='error-detail bs-callout bs-callout-info'>
        {errors
          .filter((elem) => !!elem)
          .map((error, index: number) => {
            return (
              <li className='text-danger' key={index}>
                {error}
              </li>
            );
          })}
      </ul>
    </div>
  );
}
