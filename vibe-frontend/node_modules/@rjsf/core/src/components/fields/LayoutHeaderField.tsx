import {
  getTemplate,
  getUiOptions,
  titleId,
  FieldProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  TemplatesType,
} from '@rjsf/utils';

/** The `LayoutHeaderField` component renders a `TitleFieldTemplate` with an `id` derived from the `fieldPathId`
 * and whether it is `required` from the props. The `title` is derived from the props as follows:
 * - If there is a title in the `uiSchema`, it is displayed
 * - Else, if there is an explicit `title` passed in the props, it is displayed
 * - Otherwise, if there is a title in the `schema`, it is displayed
 * - Finally, the `name` prop is displayed as the title
 *
 * @param props - The `LayoutHeaderField` for the component
 */
export default function LayoutHeaderField<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: FieldProps<T, S, F>) {
  const { fieldPathId, title, schema, uiSchema, required, registry, name } = props;
  const options = getUiOptions<T, S, F>(uiSchema, registry.globalUiOptions);
  const { title: uiTitle } = options;
  const { title: schemaTitle } = schema;
  const fieldTitle = uiTitle || title || schemaTitle || name;
  if (!fieldTitle) {
    return null;
  }
  const TitleFieldTemplate: TemplatesType<T, S, F>['TitleFieldTemplate'] = getTemplate<'TitleFieldTemplate', T, S, F>(
    'TitleFieldTemplate',
    registry,
    options,
  );
  return (
    <TitleFieldTemplate
      id={titleId(fieldPathId)}
      title={fieldTitle}
      required={required}
      schema={schema}
      uiSchema={uiSchema}
      registry={registry}
    />
  );
}
