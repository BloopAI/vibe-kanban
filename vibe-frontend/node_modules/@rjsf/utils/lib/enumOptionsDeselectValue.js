import enumOptionsValueForIndex from './enumOptionsValueForIndex.js';
import deepEquals from './deepEquals.js';
/** Removes the enum option value at the `valueIndex` from the currently `selected` (list of) value(s). If `selected` is
 * a list, then that list is updated to remove the enum option value with the `valueIndex` in `allEnumOptions`. If it is
 * a single value, then if the enum option value with the `valueIndex` in `allEnumOptions` matches `selected`, undefined
 * is returned, otherwise the `selected` value is returned.
 *
 * @param valueIndex - The index of the value to be removed from the selected list or single value
 * @param selected - The current (list of) selected value(s)
 * @param [allEnumOptions=[]] - The list of all the known enumOptions
 * @returns - The updated `selected` with the enum option value at `valueIndex` in `allEnumOptions` removed from it,
 *        unless `selected` is a single value. In that case, if the `valueIndex` value matches `selected`, returns
 *        undefined, otherwise `selected`.
 */
export default function enumOptionsDeselectValue(valueIndex, selected, allEnumOptions = []) {
    const value = enumOptionsValueForIndex(valueIndex, allEnumOptions);
    if (Array.isArray(selected)) {
        return selected.filter((v) => !deepEquals(v, value));
    }
    return deepEquals(value, selected) ? undefined : selected;
}
//# sourceMappingURL=enumOptionsDeselectValue.js.map