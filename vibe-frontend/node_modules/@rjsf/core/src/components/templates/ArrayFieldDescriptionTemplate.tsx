import {
  descriptionId,
  getTemplate,
  getUiOptions,
  ArrayFieldDescriptionProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';

/** The `ArrayFieldDescriptionTemplate` component renders a `DescriptionFieldTemplate` with an `id` derived from
 * the `fieldPathId`.
 *
 * @param props - The `ArrayFieldDescriptionProps` for the component
 */
export default function ArrayFieldDescriptionTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: ArrayFieldDescriptionProps<T, S, F>) {
  const { fieldPathId, description, registry, schema, uiSchema } = props;
  const options = getUiOptions<T, S, F>(uiSchema, registry.globalUiOptions);
  const { label: displayLabel = true } = options;
  if (!description || !displayLabel) {
    return null;
  }
  const DescriptionFieldTemplate = getTemplate<'DescriptionFieldTemplate', T, S, F>(
    'DescriptionFieldTemplate',
    registry,
    options,
  );
  return (
    <DescriptionFieldTemplate
      id={descriptionId(fieldPathId)}
      description={description}
      schema={schema}
      uiSchema={uiSchema}
      registry={registry}
    />
  );
}
