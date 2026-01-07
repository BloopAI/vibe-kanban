'use client';

import { MouseEvent, useCallback, useEffect, useMemo, useState } from 'react';

import dateRangeOptions from './dateRangeOptions';
import getDateElementProps, { DateElementFormat, DateElementProp } from './getDateElementProps';
import { ariaDescribedByIds } from './idGenerators';
import parseDateString from './parseDateString';
import toDateString from './toDateString';
import { DateObject, FormContextType, RJSFSchema, StrictRJSFSchema, WidgetProps } from './types';

/** Function that checks to see if a `DateObject` is ready for the onChange callback to be triggered
 *
 * @param state - The current `DateObject`
 * @returns - True if the `state` is ready to trigger an onChange
 */
function readyForChange(state: DateObject) {
  return Object.values(state).every((value) => value !== -1);
}

/** The Props for the `DateElement` component */
export type DateElementProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any> = Pick<
  WidgetProps<T, S, F>,
  'value' | 'name' | 'disabled' | 'readonly' | 'autofocus' | 'registry' | 'onBlur' | 'onFocus' | 'className'
> & {
  /** The root id of the field */
  rootId: string;
  /** The selector function for a specific prop within the `DateObject`, for a value */
  select: (property: keyof DateObject, value: any) => void;
  /** The type of the date element */
  type: DateElementProp['type'];
  /** The range for the date element */
  range: DateElementProp['range'];
};

/** The `DateElement` component renders one of the 6 date element selectors for an `AltDateWidget`, using the `select`
 * widget from the registry.
 *
 * @param props - The `DateElementProps` for the date element
 */
export function DateElement<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: DateElementProps<T, S, F>,
) {
  const {
    className = 'form-control',
    type,
    range,
    value,
    select,
    rootId,
    name,
    disabled,
    readonly,
    autofocus,
    registry,
    onBlur,
    onFocus,
  } = props;
  const id = `${rootId}_${type}`;
  const { SelectWidget } = registry.widgets;
  const onChange = useCallback((value: any) => select(type as keyof DateObject, value), [select, type]);
  return (
    <SelectWidget
      schema={{ type: 'integer' } as S}
      id={id}
      name={name}
      className={className}
      options={{ enumOptions: dateRangeOptions<S>(range[0], range[1]) }}
      placeholder={type}
      value={value}
      disabled={disabled}
      readonly={readonly}
      autofocus={autofocus}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      registry={registry}
      label=''
      aria-describedby={ariaDescribedByIds(rootId)}
    />
  );
}

/** The result of a call to the `useAltDateWidgetProps()` hook */
export type UseAltDateWidgetResult = {
  /** The list of `DateElementProp` data to render for the `AltDateWidget` */
  elements: DateElementProp[];
  /** The callback that handles the changing of DateElement components */
  handleChange: (property: keyof DateObject, value?: string) => void;
  /** The callback that will clear the `AltDateWidget` when a button is clicked */
  handleClear: (event: MouseEvent) => void;
  /** The callback that will set the `AltDateWidget` to NOW when a button is clicked */
  handleSetNow: (event: MouseEvent) => void;
};

/** Hook which encapsulates the logic needed to render an `AltDateWidget` with optional `time` elements. It contains
 * the `state` of the current date(/time) selections in the widget. It returns a `UseAltDateWidgetResult` object
 * that contains the `elements: DateElementProp[]` and three callbacks needed to change one of the rendered `elements`,
 * and to handle the clicking of the `clear` and `setNow` buttons.
 *
 * @param props - The `WidgetProps` for the `AltDateWidget`
 */
export default function useAltDateWidgetProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: WidgetProps<T, S, F>): UseAltDateWidgetResult {
  const { time = false, disabled = false, readonly = false, options, onChange, value } = props;
  const [state, setState] = useState(parseDateString(value, time));

  useEffect(() => {
    setState(parseDateString(value, time));
  }, [time, value]);

  const handleChange = useCallback(
    (property: keyof DateObject, value?: string) => {
      const nextState = {
        ...state,
        [property]: typeof value === 'undefined' ? -1 : value,
      };

      if (readyForChange(nextState)) {
        onChange(toDateString(nextState, time));
      } else {
        setState(nextState);
      }
    },
    [state, onChange, time],
  );

  const handleClear = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      if (disabled || readonly) {
        return;
      }
      onChange(undefined);
    },
    [disabled, readonly, onChange],
  );

  const handleSetNow = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      if (disabled || readonly) {
        return;
      }
      const nextState = parseDateString(new Date().toJSON(), time);
      onChange(toDateString(nextState, time));
    },
    [disabled, readonly, time, onChange],
  );

  const elements = useMemo(
    () =>
      getDateElementProps(
        state,
        time,
        options.yearsRange as [number, number] | undefined,
        options.format as DateElementFormat | undefined,
      ),
    [state, time, options.yearsRange, options.format],
  );
  return { elements, handleChange, handleClear, handleSetNow };
}
