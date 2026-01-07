import { EnumOptionsType, RJSFSchema, StrictRJSFSchema } from './types.js';
/** Add the enum option value at the `valueIndex` to the list of `selected` values in the proper order as defined by
 * `allEnumOptions`
 *
 * @param valueIndex - The index of the value that should be selected
 * @param selected - The current list of selected values
 * @param [allEnumOptions=[]] - The list of all the known enumOptions
 * @returns - The updated list of selected enum values with enum value at the `valueIndex` added to it
 */
export default function enumOptionsSelectValue<S extends StrictRJSFSchema = RJSFSchema>(valueIndex: string | number, selected: EnumOptionsType<S>['value'][], allEnumOptions?: EnumOptionsType<S>[]): any[];
