import isNil from 'lodash/isNil';
import isEmpty from 'lodash/isEmpty';
import isObject from 'lodash/isObject';

/** Determines whether the given `formData` represents valid form data, such as a primitive type, an array, or a
 * non-empty object.
 *
 * @param formData - The data to check
 * @returns - True if `formData` is not undefined, null, a primitive type or an array or an empty object
 */
export default function isFormDataAvailable<T = any>(formData?: T): boolean {
  return !isNil(formData) && (!isObject(formData) || Array.isArray(formData) || !isEmpty(formData));
}
