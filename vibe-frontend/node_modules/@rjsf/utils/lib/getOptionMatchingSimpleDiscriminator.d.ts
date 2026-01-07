import { RJSFSchema, StrictRJSFSchema } from './types.js';
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
export default function getOptionMatchingSimpleDiscriminator<T = any, S extends StrictRJSFSchema = RJSFSchema>(formData: T | undefined, options: S[], discriminatorField?: string): number | undefined;
