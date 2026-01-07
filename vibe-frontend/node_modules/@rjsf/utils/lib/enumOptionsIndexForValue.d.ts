import { EnumOptionsType, RJSFSchema, StrictRJSFSchema } from './types.js';
/** Returns the index(es) of the options in `allEnumOptions` whose value(s) match the ones in `value`. All the
 * `enumOptions` are filtered based on whether they are a "selected" `value` and the index of each selected one is then
 * stored in an array. If `multiple` is true, that array is returned, otherwise the first element in the array is
 * returned.
 *
 * @param value - The single value or list of values for which indexes are desired
 * @param [allEnumOptions=[]] - The list of all the known enumOptions
 * @param [multiple=false] - Optional flag, if true will return a list of index, otherwise a single one
 * @returns - A single string index for the first `value` in `allEnumOptions`, if not `multiple`. Otherwise, the list
 *        of indexes for (each of) the value(s) in `value`.
 */
export default function enumOptionsIndexForValue<S extends StrictRJSFSchema = RJSFSchema>(value: EnumOptionsType<S>['value'] | EnumOptionsType<S>['value'][], allEnumOptions?: EnumOptionsType<S>[], multiple?: boolean): string | string[] | undefined;
