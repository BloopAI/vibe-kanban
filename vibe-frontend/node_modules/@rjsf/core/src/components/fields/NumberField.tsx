import { useState, useCallback } from 'react';
import {
  asNumber,
  ErrorSchema,
  FieldPathList,
  FieldProps,
  FormContextType,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';

// Matches a string that ends in a . character, optionally followed by a sequence of
// digits followed by any number of 0 characters up until the end of the line.
// Ensuring that there is at least one prefixed character is important so that
// you don't incorrectly match against "0".
const trailingCharMatcherWithPrefix = /\.([0-9]*0)*$/;

// This is used for trimming the trailing 0 and . characters without affecting
// the rest of the string. Its possible to use one RegEx with groups for this
// functionality, but it is fairly complex compared to simply defining two
// different matchers.
const trailingCharMatcher = /[0.]0*$/;

/**
 * The NumberField class has some special handling for dealing with trailing
 * decimal points and/or zeroes. This logic is designed to allow trailing values
 * to be visible in the input element, but not be represented in the
 * corresponding form data.
 *
 * The algorithm is as follows:
 *
 * 1. When the input value changes the value is cached in the component state
 *
 * 2. The value is then normalized, removing trailing decimal points and zeros,
 *    then passed to the "onChange" callback
 *
 * 3. When the component is rendered, the formData value is checked against the
 *    value cached in the state. If it matches the cached value, the cached
 *    value is passed to the input instead of the formData value
 */
function NumberField<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(
  props: FieldProps<T, S, F>,
) {
  const { registry, onChange, formData, value: initialValue } = props;
  const [lastValue, setLastValue] = useState(initialValue);
  const { StringField } = registry.fields;

  let value = formData;

  /** Handle the change from the `StringField` to properly convert to a number
   *
   * @param value - The current value for the change occurring
   */
  const handleChange = useCallback(
    (value: FieldProps<T, S, F>['value'], path: FieldPathList, errorSchema?: ErrorSchema<T>, id?: string) => {
      // Cache the original value in component state
      setLastValue(value);

      // Normalize decimals that don't start with a zero character in advance so
      // that the rest of the normalization logic is simpler
      if (`${value}`.charAt(0) === '.') {
        value = `0${value}`;
      }

      // Check that the value is a string (this can happen if the widget used is a
      // <select>, due to an enum declaration etc) then, if the value ends in a
      // trailing decimal point or multiple zeroes, strip the trailing values
      const processed =
        typeof value === 'string' && value.match(trailingCharMatcherWithPrefix)
          ? asNumber(value.replace(trailingCharMatcher, ''))
          : asNumber(value);

      onChange(processed as unknown as T, path, errorSchema, id);
    },
    [onChange],
  );

  if (typeof lastValue === 'string' && typeof value === 'number') {
    // Construct a regular expression that checks for a string that consists
    // of the formData value suffixed with zero or one '.' characters and zero
    // or more '0' characters
    const re = new RegExp(`^(${String(value).replace('.', '\\.')})?\\.?0*$`);

    // If the cached "lastValue" is a match, use that instead of the formData
    // value to prevent the input value from changing in the UI
    if (lastValue.match(re)) {
      value = lastValue as unknown as T;
    }
  }

  return <StringField {...props} formData={value} onChange={handleChange} />;
}

export default NumberField;
