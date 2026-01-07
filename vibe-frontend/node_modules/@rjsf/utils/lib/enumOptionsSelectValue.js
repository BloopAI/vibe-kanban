import enumOptionsValueForIndex from './enumOptionsValueForIndex.js';
import isNil from 'lodash-es/isNil.js';
/** Add the enum option value at the `valueIndex` to the list of `selected` values in the proper order as defined by
 * `allEnumOptions`
 *
 * @param valueIndex - The index of the value that should be selected
 * @param selected - The current list of selected values
 * @param [allEnumOptions=[]] - The list of all the known enumOptions
 * @returns - The updated list of selected enum values with enum value at the `valueIndex` added to it
 */
export default function enumOptionsSelectValue(valueIndex, selected, allEnumOptions = []) {
    const value = enumOptionsValueForIndex(valueIndex, allEnumOptions);
    if (!isNil(value)) {
        const index = allEnumOptions.findIndex((opt) => value === opt.value);
        const all = allEnumOptions.map(({ value: val }) => val);
        const updated = selected.slice(0, index).concat(value, selected.slice(index));
        // As inserting values at predefined index positions doesn't work with empty
        // arrays, we need to reorder the updated selection to match the initial order
        return updated.sort((a, b) => Number(all.indexOf(a) > all.indexOf(b)));
    }
    return selected;
}
//# sourceMappingURL=enumOptionsSelectValue.js.map