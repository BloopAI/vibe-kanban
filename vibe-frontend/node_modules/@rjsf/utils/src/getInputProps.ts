import rangeSpec from './rangeSpec';
import { FormContextType, InputPropsType, RJSFSchema, StrictRJSFSchema, UIOptionsType } from './types';

/** Using the `schema`, `defaultType` and `options`, extract out the props for the <input> element that make sense.
 *
 * @param schema - The schema for the field provided by the widget
 * @param [defaultType] - The default type, if any, for the field provided by the widget
 * @param [options={}] - The UI Options for the field provided by the widget
 * @param [autoDefaultStepAny=true] - Determines whether to auto-default step=any when the type is number and no step
 * @returns - The extracted `InputPropsType` object
 */
export default function getInputProps<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(
  schema: RJSFSchema,
  defaultType?: string,
  options: UIOptionsType<T, S, F> = {},
  autoDefaultStepAny = true,
): InputPropsType {
  const inputProps: InputPropsType = {
    type: defaultType || 'text',
    ...rangeSpec(schema),
  };

  // If options.inputType is set use that as the input type
  if (options.inputType) {
    inputProps.type = options.inputType;
  } else if (!defaultType) {
    // If the schema is of type number or integer, set the input type to number
    if (schema.type === 'number') {
      inputProps.type = 'number';
      // Only add step if one isn't already defined and we are auto-defaulting the "any" step
      if (autoDefaultStepAny && inputProps.step === undefined) {
        // Setting step to 'any' fixes a bug in Safari where decimals are not
        // allowed in number inputs
        inputProps.step = 'any';
      }
    } else if (schema.type === 'integer') {
      inputProps.type = 'number';
      // Only add step if one isn't already defined
      if (inputProps.step === undefined) {
        // Since this is integer, you always want to step up or down in multiples of 1
        inputProps.step = 1;
      }
    }
  }

  if (options.autocomplete) {
    inputProps.autoComplete = options.autocomplete;
  }

  if (options.accept) {
    inputProps.accept = options.accept as string;
  }

  return inputProps;
}
