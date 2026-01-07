import deepEquals from './deepEquals.js';
/** Determines whether the given `value` is (one of) the `selected` value(s).
 *
 * @param value - The value being checked to see if it is selected
 * @param selected - The current selected value or list of values
 * @returns - true if the `value` is one of the `selected` ones, false otherwise
 */
export default function enumOptionsIsSelected(value, selected) {
    if (Array.isArray(selected)) {
        return selected.some((sel) => deepEquals(sel, value));
    }
    return deepEquals(selected, value);
}
//# sourceMappingURL=enumOptionsIsSelected.js.map