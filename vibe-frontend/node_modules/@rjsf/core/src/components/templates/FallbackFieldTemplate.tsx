import { FallbackFieldTemplateProps, FormContextType, getTemplate, RJSFSchema, StrictRJSFSchema } from '@rjsf/utils';

/**
 * The `FallbackFieldTemplate` is used to render a field when no field matches. The field renders a type selector and
 * the schema field for the form data.
 */
export default function FallbackFieldTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: FallbackFieldTemplateProps<T, S, F>) {
  const { schema, registry, typeSelector, schemaField } = props;

  // By default, use the MultiSchemaFieldTemplate, which handles the same basic requirements.
  const MultiSchemaFieldTemplate = getTemplate<'MultiSchemaFieldTemplate', T, S, F>(
    'MultiSchemaFieldTemplate',
    registry,
  );

  return (
    <MultiSchemaFieldTemplate
      selector={typeSelector}
      optionSchemaField={schemaField}
      schema={schema}
      registry={registry}
    />
  );
}
