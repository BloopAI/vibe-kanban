import { FocusEvent, useCallback } from 'react';
import {
  ariaDescribedByIds,
  enumOptionsIsSelected,
  enumOptionsValueForIndex,
  optionId,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  WidgetProps,
} from '@rjsf/utils';

/** The `RadioWidget` is a widget for rendering a radio group.
 *  It is typically used with a string property constrained with enum options.
 *
 * @param props - The `WidgetProps` for this component
 */
function RadioWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>({
  options,
  value,
  required,
  disabled,
  readonly,
  autofocus = false,
  onBlur,
  onFocus,
  onChange,
  id,
  htmlName,
}: WidgetProps<T, S, F>) {
  const { enumOptions, enumDisabled, inline, emptyValue } = options;

  const handleBlur = useCallback(
    ({ target }: FocusEvent<HTMLInputElement>) =>
      onBlur(id, enumOptionsValueForIndex<S>(target && target.value, enumOptions, emptyValue)),
    [onBlur, enumOptions, emptyValue, id],
  );

  const handleFocus = useCallback(
    ({ target }: FocusEvent<HTMLInputElement>) =>
      onFocus(id, enumOptionsValueForIndex<S>(target && target.value, enumOptions, emptyValue)),
    [onFocus, enumOptions, emptyValue, id],
  );

  return (
    <div className='field-radio-group' id={id} role='radiogroup'>
      {Array.isArray(enumOptions) &&
        enumOptions.map((option, i) => {
          const checked = enumOptionsIsSelected<S>(option.value, value);
          const itemDisabled = Array.isArray(enumDisabled) && enumDisabled.indexOf(option.value) !== -1;
          const disabledCls = disabled || itemDisabled || readonly ? 'disabled' : '';

          const handleChange = () => onChange(option.value);

          const radio = (
            <span>
              <input
                type='radio'
                id={optionId(id, i)}
                checked={checked}
                name={htmlName || id}
                required={required}
                value={String(i)}
                disabled={disabled || itemDisabled || readonly}
                autoFocus={autofocus && i === 0}
                onChange={handleChange}
                onBlur={handleBlur}
                onFocus={handleFocus}
                aria-describedby={ariaDescribedByIds(id)}
              />
              <span>{option.label}</span>
            </span>
          );

          return inline ? (
            <label key={i} className={`radio-inline ${disabledCls}`}>
              {radio}
            </label>
          ) : (
            <div key={i} className={`radio ${disabledCls}`}>
              <label>{radio}</label>
            </div>
          );
        })}
    </div>
  );
}

export default RadioWidget;
