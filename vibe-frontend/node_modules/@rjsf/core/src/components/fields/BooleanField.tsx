import { useCallback } from 'react';
import {
  getWidget,
  getUiOptions,
  optionsList,
  FieldProps,
  FormContextType,
  EnumOptionsType,
  ErrorSchema,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
} from '@rjsf/utils';
import isObject from 'lodash/isObject';

/** The `BooleanField` component is used to render a field in the schema is boolean. It constructs `enumOptions` for the
 * two boolean values based on the various alternatives in the schema.
 *
 * @param props - The `FieldProps` for this template
 */
function BooleanField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: FieldProps<T, S, F>,
) {
  const {
    schema,
    name,
    uiSchema,
    fieldPathId,
    formData,
    registry,
    required,
    disabled,
    readonly,
    hideError,
    autofocus,
    title,
    onChange,
    onFocus,
    onBlur,
    rawErrors,
  } = props;
  const { title: schemaTitle } = schema;
  const { widgets, translateString, globalUiOptions } = registry;
  const {
    widget = 'checkbox',
    title: uiTitle,
    // Unlike the other fields, don't use `getDisplayLabel()` since it always returns false for the boolean type
    label: displayLabel = true,
    enumNames,
    ...options
  } = getUiOptions<T, S, F>(uiSchema, globalUiOptions);
  const Widget = getWidget(schema, widget, widgets);
  const yes = translateString(TranslatableString.YesLabel);
  const no = translateString(TranslatableString.NoLabel);
  let enumOptions: EnumOptionsType<S>[] | undefined;
  const label = uiTitle ?? schemaTitle ?? title ?? name;
  if (Array.isArray(schema.oneOf)) {
    enumOptions = optionsList<T, S, F>(
      {
        oneOf: schema.oneOf
          .map((option) => {
            if (isObject(option)) {
              return {
                ...option,
                title: option.title || (option.const === true ? yes : no),
              };
            }
            return undefined;
          })
          .filter((o: any) => o) as S[], // cast away the error that typescript can't grok is fixed
      } as unknown as S,
      uiSchema,
    );
  } else {
    const enums = schema.enum ?? [true, false];
    if (!enumNames && enums.length === 2 && enums.every((v: any) => typeof v === 'boolean')) {
      enumOptions = [
        {
          value: enums[0],
          label: enums[0] ? yes : no,
        },
        {
          value: enums[1],
          label: enums[1] ? yes : no,
        },
      ];
    } else {
      enumOptions = optionsList<T, S, F>({ enum: enums } as S, uiSchema);
    }
  }
  const onWidgetChange = useCallback(
    (value: T | undefined, errorSchema?: ErrorSchema, id?: string) => {
      // Boolean field change passes an empty path array to the parent field which adds the appropriate path
      return onChange(value, fieldPathId.path, errorSchema, id);
    },
    [onChange, fieldPathId],
  );

  return (
    <Widget
      options={{ ...options, enumOptions }}
      schema={schema}
      uiSchema={uiSchema}
      id={fieldPathId.$id}
      name={name}
      onChange={onWidgetChange}
      onFocus={onFocus}
      onBlur={onBlur}
      label={label}
      hideLabel={!displayLabel}
      value={formData}
      required={required}
      disabled={disabled}
      readonly={readonly}
      hideError={hideError}
      registry={registry}
      autofocus={autofocus}
      rawErrors={rawErrors}
      htmlName={fieldPathId.name}
    />
  );
}

export default BooleanField;
