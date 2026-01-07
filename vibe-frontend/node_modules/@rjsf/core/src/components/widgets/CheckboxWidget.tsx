import { ChangeEvent, FocusEvent, useCallback } from 'react';
import {
  ariaDescribedByIds,
  descriptionId,
  getTemplate,
  labelValue,
  schemaRequiresTrueValue,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
  getUiOptions,
} from '@rjsf/utils';

/** The `CheckBoxWidget` is a widget for rendering boolean properties.
 *  It is typically used to represent a boolean.
 *
 * @param props - The `WidgetProps` for this component
 */
function CheckboxWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  schema,
  uiSchema,
  options,
  id,
  value,
  disabled,
  readonly,
  label,
  hideLabel,
  autofocus = false,
  onBlur,
  onFocus,
  onChange,
  registry,
  htmlName,
}: WidgetProps<T, S, F>) {
  const DescriptionFieldTemplate = getTemplate<'DescriptionFieldTemplate', T, S, F>(
    'DescriptionFieldTemplate',
    registry,
    options,
  );
  // Because an unchecked checkbox will cause html5 validation to fail, only add
  // the "required" attribute if the field value must be "true", due to the
  // "const" or "enum" keywords
  const required = schemaRequiresTrueValue<S>(schema);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked),
    [onChange],
  );

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => onBlur(id, event.target.checked),
    [onBlur, id],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => onFocus(id, event.target.checked),
    [onFocus, id],
  );

  const uiOptions = getUiOptions(uiSchema);
  const isCheckboxWidget = uiOptions.widget === 'checkbox';
  const description = isCheckboxWidget ? undefined : (options.description ?? schema.description);
  return (
    <div className={`checkbox ${disabled || readonly ? 'disabled' : ''}`}>
      {!hideLabel && description && (
        <DescriptionFieldTemplate
          id={descriptionId(id)}
          description={description}
          schema={schema}
          uiSchema={uiSchema}
          registry={registry}
        />
      )}
      <label>
        <input
          type='checkbox'
          id={id}
          name={htmlName || id}
          checked={typeof value === 'undefined' ? false : value}
          required={required}
          disabled={disabled || readonly}
          autoFocus={autofocus}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          aria-describedby={ariaDescribedByIds(id)}
        />
        {labelValue(<span>{label}</span>, hideLabel)}
      </label>
    </div>
  );
}

export default CheckboxWidget;
