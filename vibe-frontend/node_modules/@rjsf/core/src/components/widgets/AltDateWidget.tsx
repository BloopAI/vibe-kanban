import {
  DateElement,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
  TranslatableString,
  WidgetProps,
  useAltDateWidgetProps,
} from '@rjsf/utils';

/** The `AltDateWidget` is an alternative widget for rendering date properties.
 * @param props - The `WidgetProps` for this component
 */
function AltDateWidget<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: WidgetProps<T, S, F>,
) {
  const { disabled = false, readonly = false, autofocus = false, options, id, name, registry, onBlur, onFocus } = props;
  const { translateString } = registry;
  const { elements, handleChange, handleClear, handleSetNow } = useAltDateWidgetProps(props);

  return (
    <ul className='list-inline'>
      {elements.map((elemProps, i) => (
        <li className='list-inline-item' key={i}>
          <DateElement
            rootId={id}
            name={name}
            select={handleChange}
            {...elemProps}
            disabled={disabled}
            readonly={readonly}
            registry={registry}
            onBlur={onBlur}
            onFocus={onFocus}
            autofocus={autofocus && i === 0}
          />
        </li>
      ))}
      {(options.hideNowButton !== 'undefined' ? !options.hideNowButton : true) && (
        <li className='list-inline-item'>
          <a href='#' className='btn btn-info btn-now' onClick={handleSetNow}>
            {translateString(TranslatableString.NowLabel)}
          </a>
        </li>
      )}
      {(options.hideClearButton !== 'undefined' ? !options.hideClearButton : true) && (
        <li className='list-inline-item'>
          <a href='#' className='btn btn-warning btn-clear' onClick={handleClear}>
            {translateString(TranslatableString.ClearLabel)}
          </a>
        </li>
      )}
    </ul>
  );
}

export default AltDateWidget;
