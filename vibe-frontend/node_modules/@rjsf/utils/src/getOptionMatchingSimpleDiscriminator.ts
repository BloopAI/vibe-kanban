import get from 'lodash/get';
import { PROPERTIES_KEY } from './constants';
import { RJSFSchema, StrictRJSFSchema } from './types';

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
export default function getOptionMatchingSimpleDiscriminator<T = any, S extends StrictRJSFSchema = RJSFSchema>(
  formData: T | undefined,
  options: S[],
  discriminatorField?: string,
): number | undefined {
  if (formData && discriminatorField) {
    const value = get(formData, discriminatorField);

    if (value === undefined) {
      return;
    }

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const discriminator: S = get(option, [PROPERTIES_KEY, discriminatorField], {}) as S;

      if (discriminator.type === 'object' || discriminator.type === 'array') {
        continue;
      }

      if (discriminator.const === value) {
        return i;
      }

      if (discriminator.enum?.includes(value)) {
        return i;
      }
    }
  }

  return;
}
