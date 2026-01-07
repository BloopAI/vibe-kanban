import { FormContextType, InputPropsType, RJSFSchema, StrictRJSFSchema, UIOptionsType } from './types.js';
/** Using the `schema`, `defaultType` and `options`, extract out the props for the <input> element that make sense.
 *
 * @param schema - The schema for the field provided by the widget
 * @param [defaultType] - The default type, if any, for the field provided by the widget
 * @param [options={}] - The UI Options for the field provided by the widget
 * @param [autoDefaultStepAny=true] - Determines whether to auto-default step=any when the type is number and no step
 * @returns - The extracted `InputPropsType` object
 */
export default function getInputProps<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(schema: RJSFSchema, defaultType?: string, options?: UIOptionsType<T, S, F>, autoDefaultStepAny?: boolean): InputPropsType;
