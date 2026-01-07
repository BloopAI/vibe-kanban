import {
  FallbackFieldProps,
  FieldPathId,
  FormContextType,
  getTemplate,
  getUiOptions,
  hashObject,
  RJSFSchema,
  StrictRJSFSchema,
  toFieldPathId,
  TranslatableString,
  useDeepCompareMemo,
} from '@rjsf/utils';
import { useMemo, useState } from 'react';
import { JSONSchema7TypeName } from 'json-schema';

/**
 * Get the schema for the type selection component.
 * @param title - The translated title for the type selection schema.
 */
function getFallbackTypeSelectionSchema(title: string): RJSFSchema {
  return {
    type: 'string',
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    default: 'string',
    title: title,
  };
}

/**
 * Determines the JSON Schema type of the given formData.
 * @param formData - The form data whose type is to be determined.
 */
function getTypeOfFormData(formData: any): JSONSchema7TypeName {
  const dataType = typeof formData;
  if (dataType === 'string' || dataType === 'number' || dataType === 'boolean') {
    return dataType;
  }
  if (dataType === 'object') {
    return Array.isArray(formData) ? 'array' : 'object';
  }
  // Treat everything else as a string
  return 'string';
}

/**
 * Casts the given formData to the specified type.
 * @param formData - The form data to be casted.
 * @param newType - The target type to which the form data should be casted.
 */
function castToNewType<T = any>(formData: T, newType: JSONSchema7TypeName): T {
  switch (newType) {
    case 'string':
      return String(formData) as T;
    case 'number': {
      const castedNumber = Number(formData);
      return (isNaN(castedNumber) ? 0 : castedNumber) as T;
    }
    case 'boolean':
      return Boolean(formData) as T;
    default:
      return formData;
  }
}

/**
 * The `FallbackField` component is used to render a field for unsupported or unknown schema types. If
 * `useFallbackUiForUnsupportedType` is enabled in the `globalUiOptions`, it provides a type selector
 */
export default function FallbackField<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: FallbackFieldProps<T, S, F>) {
  const {
    id,
    formData,
    displayLabel = true,
    schema,
    name,
    uiSchema,
    required,
    disabled = false,
    readonly = false,
    onBlur,
    onFocus,
    registry,
    fieldPathId,
    onChange,
    errorSchema,
  } = props;
  const { translateString, fields, globalFormOptions } = registry;
  const [type, setType] = useState<JSONSchema7TypeName>(getTypeOfFormData(formData));

  const uiOptions = getUiOptions<T, S, F>(uiSchema);

  const typeSelectorInnerFieldPathId = useDeepCompareMemo<FieldPathId>(
    toFieldPathId('__internal_type_selector', globalFormOptions, fieldPathId),
  );

  const schemaTitle = translateString(TranslatableString.Type);
  const typesOptionSchema = useMemo(() => getFallbackTypeSelectionSchema(schemaTitle), [schemaTitle]);

  const onTypeChange = (newType: T | undefined) => {
    if (newType != null) {
      setType(newType as JSONSchema7TypeName);
      onChange(castToNewType<T>(formData as T, newType as JSONSchema7TypeName), fieldPathId.path, errorSchema, id);
    }
  };

  if (!globalFormOptions.useFallbackUiForUnsupportedType) {
    const { reason = translateString(TranslatableString.UnknownFieldType, [String(schema.type)]) } = props;
    const UnsupportedFieldTemplate = getTemplate<'UnsupportedFieldTemplate', T, S, F>(
      'UnsupportedFieldTemplate',
      registry,
      uiOptions,
    );

    return <UnsupportedFieldTemplate schema={schema} fieldPathId={fieldPathId} reason={reason} registry={registry} />;
  }

  const FallbackFieldTemplate = getTemplate<'FallbackFieldTemplate', T, S, F>(
    'FallbackFieldTemplate',
    registry,
    uiOptions,
  );

  const { SchemaField } = fields;

  return (
    <FallbackFieldTemplate
      schema={schema}
      registry={registry}
      typeSelector={
        <SchemaField
          key={formData ? hashObject(formData) : '__empty__'}
          fieldPathId={typeSelectorInnerFieldPathId}
          name={`${name}__fallback_type`}
          schema={typesOptionSchema as S}
          formData={type as T}
          onChange={onTypeChange}
          onBlur={onBlur}
          onFocus={onFocus}
          registry={registry}
          hideLabel={!displayLabel}
          disabled={disabled}
          readonly={readonly}
          required={required}
        />
      }
      schemaField={
        <SchemaField
          {...props}
          schema={
            {
              type,
              title: translateString(TranslatableString.Value),
              ...(type === 'object' && { additionalProperties: true }),
            } as S
          }
        />
      }
    />
  );
}
