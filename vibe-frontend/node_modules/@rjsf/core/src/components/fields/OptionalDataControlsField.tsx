import {
  FieldProps,
  FormContextType,
  getSchemaType,
  getTemplate,
  getUiOptions,
  isFormDataAvailable,
  optionalControlsId,
  OptionalDataControlsTemplateProps,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
} from '@rjsf/utils';

/** The `OptionalDataControlsField` component is used to render the optional data controls for the field associated
 * with the given props.
 *
 * @param props - The `FieldProps` for this template
 */
export default function OptionalDataControlsField<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: FieldProps<T, S, F>) {
  const {
    schema,
    uiSchema = {},
    formData,
    disabled = false,
    readonly = false,
    onChange,
    errorSchema,
    fieldPathId,
    registry,
  } = props;

  const { globalUiOptions = {}, schemaUtils, translateString } = registry;
  const uiOptions = getUiOptions<T, S, F>(uiSchema, globalUiOptions);
  const OptionalDataControlsTemplate = getTemplate<'OptionalDataControlsTemplate', T, S, F>(
    'OptionalDataControlsTemplate',
    registry,
    uiOptions,
  );
  const hasFormData = isFormDataAvailable<T>(formData);
  let id: string;
  let label: string | undefined;
  let onAddClick: OptionalDataControlsTemplateProps['onAddClick'];
  let onRemoveClick: OptionalDataControlsTemplateProps['onRemoveClick'];
  if (disabled || readonly) {
    id = optionalControlsId(fieldPathId, 'Msg');
    label = hasFormData ? undefined : translateString(TranslatableString.OptionalObjectEmptyMsg);
  } else {
    const labelEnum = hasFormData ? TranslatableString.OptionalObjectRemove : TranslatableString.OptionalObjectAdd;
    label = translateString(labelEnum);
    if (hasFormData) {
      id = optionalControlsId(fieldPathId, 'Remove');
      onRemoveClick = () => onChange(undefined as T, fieldPathId.path, errorSchema);
    } else {
      id = optionalControlsId(fieldPathId, 'Add');
      onAddClick = () => {
        // If it has form data, store an empty object, otherwise get the default form state and use it
        let newFormData: unknown = schemaUtils.getDefaultFormState(schema, formData, 'excludeObjectChildren');
        if (newFormData === undefined) {
          // If new form data ended up being undefined, and we have pushed the add button we need to actually add data
          newFormData = getSchemaType<S>(schema) === 'array' ? [] : {};
        }
        onChange(newFormData as T, fieldPathId.path, errorSchema);
      };
    }
  }
  return (
    label && (
      <OptionalDataControlsTemplate
        id={id}
        registry={registry}
        schema={schema}
        uiSchema={uiSchema}
        label={label}
        onAddClick={onAddClick}
        onRemoveClick={onRemoveClick}
      />
    )
  );
}
