import replaceStringParameters from './replaceStringParameters.js';
/** Translates a `TranslatableString` value `stringToTranslate` into english. When a `params` array is provided, each
 * value in the array is used to replace any of the replaceable parameters in the `stringToTranslate` using the `%1`,
 * `%2`, etc. replacement specifiers.
 *
 * @param stringToTranslate - The `TranslatableString` value to convert to english
 * @param params - The optional list of replaceable parameter values to substitute into the english string
 * @returns - The `stringToTranslate` itself with any replaceable parameter values substituted
 */
export default function englishStringTranslator(stringToTranslate, params) {
    return replaceStringParameters(stringToTranslate, params);
}
//# sourceMappingURL=englishStringTranslator.js.map