import get from 'lodash-es/get.js';
import { PROPERTIES_KEY } from './constants.js';
/** Compares the value of `discriminatorField` within `formData` against the value of `discriminatorField` within schema for each `option`.
 * Returns index of first `option` whose discriminator matches formData. Returns `undefined` if there is no match.
 * This function does not work with discriminators of `"type": "object"` and `"type": "array"`
 *
 * @param formData - The current formData, if any, used to figure out a match
 * @param options - The list of options to find a matching options from
 * @param [discriminatorField] - The optional name of the field within the options object whose value is used to
 *          determine which option is selected
 * @returns - The index of the matched option or undefined if there is no match
 */
export default function getOptionMatchingSimpleDiscriminator(formData, options, discriminatorField) {
    var _a;
    if (formData && discriminatorField) {
        const value = get(formData, discriminatorField);
        if (value === undefined) {
            return;
        }
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            const discriminator = get(option, [PROPERTIES_KEY, discriminatorField], {});
            if (discriminator.type === 'object' || discriminator.type === 'array') {
                continue;
            }
            if (discriminator.const === value) {
                return i;
            }
            if ((_a = discriminator.enum) === null || _a === void 0 ? void 0 : _a.includes(value)) {
                return i;
            }
        }
    }
    return;
}
//# sourceMappingURL=getOptionMatchingSimpleDiscriminator.js.map