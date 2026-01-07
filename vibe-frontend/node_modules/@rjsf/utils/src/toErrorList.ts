import isPlainObject from 'lodash/isPlainObject';

import { ERRORS_KEY } from './constants';
import { ErrorSchema, GenericObjectType, RJSFValidationError } from './types';

/** Converts an `errorSchema` into a list of `RJSFValidationErrors`
 *
 * @param errorSchema - The `ErrorSchema` instance to convert
 * @param [fieldPath=[]] - The current field path, defaults to [] if not specified
 * @returns - The list of `RJSFValidationErrors` extracted from the `errorSchema`
 */
export default function toErrorList<T = any>(
  errorSchema?: ErrorSchema<T>,
  fieldPath: string[] = [],
): RJSFValidationError[] {
  if (!errorSchema) {
    return [];
  }
  let errorList: RJSFValidationError[] = [];
  if (ERRORS_KEY in errorSchema) {
    errorList = errorList.concat(
      errorSchema[ERRORS_KEY]!.map((message: string) => {
        const property = `.${fieldPath.join('.')}`;
        return {
          property,
          message,
          stack: `${property} ${message}`,
        };
      }),
    );
  }
  return Object.keys(errorSchema).reduce((acc, key) => {
    if (key !== ERRORS_KEY) {
      const childSchema = (errorSchema as GenericObjectType)[key];
      if (isPlainObject(childSchema)) {
        acc = acc.concat(toErrorList(childSchema, [...fieldPath, key]));
      }
    }
    return acc;
  }, errorList);
}
