import { FormContextType, MultiSchemaFieldTemplateProps, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

/** The `MultiSchemaFieldTemplate` component renders the layout for the MultiSchemaField, which supports choosing
 * a schema from a list of schemas defined using `anyOf` or `oneOf`.
 *
 * @param props - The `MultiSchemaFieldTemplate` to be rendered
 */
export default function MultiSchemaFieldTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: MultiSchemaFieldTemplateProps<T, S, F>) {
  const { selector, optionSchemaField } = props;
  return (
    <div className='panel panel-default panel-body'>
      <div className='form-group'>{selector}</div>
      {optionSchemaField}
    </div>
  );
}
