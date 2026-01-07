import get from 'lodash/get';

import isObject from './isObject';
import { GenericObjectType } from '../src';
import isNil from 'lodash/isNil';

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
export default function mergeDefaultsWithFormData<T = any>(
  defaults?: T,
  formData?: T,
  mergeExtraArrayDefaults = false,
  defaultSupercedesUndefined = false,
  overrideFormDataWithDefaults = false,
): T | undefined {
  if (Array.isArray(formData)) {
    const defaultsArray = Array.isArray(defaults) ? defaults : [];

    // If overrideFormDataWithDefaults is true, we want to override the formData with the defaults
    const overrideArray = overrideFormDataWithDefaults ? defaultsArray : formData;
    const overrideOppositeArray = overrideFormDataWithDefaults ? formData : defaultsArray;

    const mapped = overrideArray.map((value, idx) => {
      // We want to explicitly make sure that the value is NOT undefined since null, 0 and empty space are valid values
      if (overrideOppositeArray[idx] !== undefined) {
        return mergeDefaultsWithFormData<any>(
          defaultsArray[idx],
          formData[idx],
          mergeExtraArrayDefaults,
          defaultSupercedesUndefined,
          overrideFormDataWithDefaults,
        );
      }
      return value;
    });

    // Merge any extra defaults when mergeExtraArrayDefaults is true
    // Or when overrideFormDataWithDefaults is true and the default array is shorter than the formData array
    if ((mergeExtraArrayDefaults || overrideFormDataWithDefaults) && mapped.length < overrideOppositeArray.length) {
      mapped.push(...overrideOppositeArray.slice(mapped.length));
    }
    return mapped as unknown as T;
  }
  if (isObject(formData)) {
    const acc: { [key in keyof T]: any } = Object.assign({}, defaults); // Prevent mutation of source object.
    return Object.keys(formData as GenericObjectType).reduce((acc, key) => {
      const keyValue = get(formData, key);
      const keyExistsInDefaults = isObject(defaults) && key in (defaults as GenericObjectType);
      const keyExistsInFormData = key in (formData as GenericObjectType);
      const keyDefault = get(defaults, key) ?? {};
      const defaultValueIsNestedObject = keyExistsInDefaults && Object.entries(keyDefault).some(([, v]) => isObject(v));

      const keyDefaultIsObject = keyExistsInDefaults && isObject(get(defaults, key));
      const keyHasFormDataObject = keyExistsInFormData && isObject(keyValue);

      if (keyDefaultIsObject && keyHasFormDataObject && !defaultValueIsNestedObject) {
        acc[key as keyof T] = {
          ...get(defaults, key),
          ...keyValue,
        };
        return acc;
      }

      acc[key as keyof T] = mergeDefaultsWithFormData<T>(
        get(defaults, key),
        keyValue,
        mergeExtraArrayDefaults,
        defaultSupercedesUndefined,
        // overrideFormDataWithDefaults can be true only when the key value exists in defaults
        // Or if the key value doesn't exist in formData
        overrideFormDataWithDefaults && (keyExistsInDefaults || !keyExistsInFormData),
      );
      return acc;
    }, acc);
  }

  /**
   * If the defaultSupercedesUndefined flag is true
   *    And formData is set to undefined or null and defaults are defined
   *    Or if formData is a number and is NaN return defaults
   * Or if overrideFormDataWithDefaults flag is true and formData is set to not undefined/null return defaults
   */
  if (
    (defaultSupercedesUndefined &&
      ((!(defaults === undefined) && isNil(formData)) || (typeof formData === 'number' && isNaN(formData)))) ||
    (overrideFormDataWithDefaults && !isNil(formData))
  ) {
    return defaults;
  }

  return formData;
}
