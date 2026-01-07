/** Merges the `defaults` object of type `T` into the `formData` of type `T`
 *
 * When merging defaults and form data, we want to merge in this specific way:
 * - objects are deeply merged
 * - arrays are merged in such a way that:
 *   - when the array is set in form data, only array entries set in form data
 *     are deeply merged; additional entries from the defaults are ignored unless `mergeExtraArrayDefaults` is true, in
 *     which case the extras are appended onto the end of the form data
 *   - when the array is not set in form data, the default is copied over
 * - scalars are overwritten/set by form data unless undefined and there is a default AND `defaultSupercedesUndefined`
 *   is true
 *
 * @param [defaults] - The defaults to merge
 * @param [formData] - The form data into which the defaults will be merged
 * @param [mergeExtraArrayDefaults=false] - If true, any additional default array entries are appended onto the formData
 * @param [defaultSupercedesUndefined=false] - If true, an explicit undefined value will be overwritten by the default value
 * @param [overrideFormDataWithDefaults=false] - If true, the default value will overwrite the form data value. If the value
 *        doesn't exist in the default, we take it from formData and in the case where the value is set to undefined in formData.
 *       This is useful when we have already merged formData with defaults and want to add an additional field from formData
 *       that does not exist in defaults.
 * @returns - The resulting merged form data with defaults
 */
export default function mergeDefaultsWithFormData<T = any>(defaults?: T, formData?: T, mergeExtraArrayDefaults?: boolean, defaultSupercedesUndefined?: boolean, overrideFormDataWithDefaults?: boolean): T | undefined;
