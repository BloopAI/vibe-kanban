import { EnumOptionsType, RJSFSchema, StrictRJSFSchema } from './types.js';
/** Returns the value(s) from `allEnumOptions` at the index(es) provided by `valueIndex`. If `valueIndex` is not an
 * array AND the index is not valid for `allEnumOptions`, `emptyValue` is returned. If `valueIndex` is an array, AND it
 * contains an invalid index, the returned array will have the resulting undefined values filtered out, leaving only
 * valid values or in the worst case, an empty array.
 *
 * @param valueIndex - The index(es) of the value(s) that should be returned
 * @param [allEnumOptions=[]] - The list of all the known enumOptions
 * @param [emptyValue] - The value to return when the non-array `valueIndex` does not refer to a real option
 * @returns - The single or list of values specified by the single or list of indexes if they are valid. Otherwise,
 *        `emptyValue` or an empty list.
 */
export default function enumOptionsValueForIndex<S extends StrictRJSFSchema = RJSFSchema>(valueIndex: string | number | Array<string | number>, allEnumOptions?: EnumOptionsType<S>[], emptyValue?: EnumOptionsType<S>['value']): EnumOptionsType<S>['value'] | EnumOptionsType<S>['value'][] | undefined;
