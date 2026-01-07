import { Experimental_CustomMergeAllOf, FormContextType, RJSFSchema, StrictRJSFSchema, ValidatorType } from '../types.js';
/** A junk option used to determine when the getFirstMatchingOption call really matches an option rather than returning
 * the first item
 */
export declare const JUNK_OPTION: StrictRJSFSchema;
/** Recursive function that calculates the score of a `formData` against the given `schema`. The computation is fairly
 * simple. Initially the total score is 0. When `schema.properties` object exists, then all the `key/value` pairs within
 * the object are processed as follows after obtaining the formValue from `formData` using the `key`:
 * - If the `value` contains a `$ref`, `calculateIndexScore()` is called recursively with the formValue and the new
 *   schema that is the result of the ref in the schema being resolved and that sub-schema's resulting score is added to
 *   the total.
 * - If the `value` contains a `oneOf` and there is a formValue, then score based on the index returned from calling
 *   `getClosestMatchingOption()` of that oneOf.
 * - If the type of the `value` is 'object', `calculateIndexScore()` is called recursively with the formValue and the
 *   `value` itself as the sub-schema, and the score is added to the total.
 * - If the type of the `value` matches the guessed-type of the `formValue`, the score is incremented by 1, UNLESS the
 *   value has a `default` or `const`. In those case, if the `default` or `const` and the `formValue` match, the score
 *   is incremented by another 1 otherwise it is decremented by 1.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param rootSchema - The root JSON schema of the entire form
 * @param schema - The schema for which the score is being calculated
 * @param formData - The form data associated with the schema, used to calculate the score
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The score a schema against the formData
 */
export declare function calculateIndexScore<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, rootSchema: S, schema?: S, formData?: any, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): number;
/** Determines which of the given `options` provided most closely matches the `formData`. Using
 * `getFirstMatchingOption()` to match two schemas that differ only by the readOnly, default or const value of a field
 * based on the `formData` and returns 0 when there is no match. Rather than passing in all the `options` at once to
 * this utility, instead an array of valid option indexes is created by iterating over the list of options, call
 * `getFirstMatchingOptions` with a list of one junk option and one good option, seeing if the good option is considered
 * matched.
 *
 * Once the list of valid indexes is created, if there is only one valid index, just return it. Otherwise, if there are
 * no valid indexes, then fill the valid indexes array with the indexes of all the options. Next, the index of the
 * option with the highest score is determined by iterating over the list of valid options, calling
 * `calculateIndexScore()` on each, comparing it against the current best score, and returning the index of the one that
 * eventually has the best score.
 *
 * @param validator - An implementation of the `ValidatorType` interface that will be used when necessary
 * @param rootSchema - The root JSON schema of the entire form
 * @param formData - The form data associated with the schema
 * @param options - The list of options that can be selected from
 * @param [selectedOption=-1] - The index of the currently selected option, defaulted to -1 if not specified
 * @param [discriminatorField] - The optional name of the field within the options object whose value is used to
 *          determine which option is selected
 * @param [experimental_customMergeAllOf] - Optional function that allows for custom merging of `allOf` schemas
 * @returns - The index of the option that is the closest match to the `formData` or the `selectedOption` if no match
 */
export default function getClosestMatchingOption<T = any, S extends StrictRJSFSchema = RJSFSchema, F extends FormContextType = any>(validator: ValidatorType<T, S, F>, rootSchema: S, formData: T | undefined, options: S[], selectedOption?: number, discriminatorField?: string, experimental_customMergeAllOf?: Experimental_CustomMergeAllOf<S>): number;
