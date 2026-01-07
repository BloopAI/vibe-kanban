import isPlainObject from 'lodash/isPlainObject';

import { ErrorSchema, FormValidation, GenericObjectType } from './types';

/** Unwraps the `errorHandler` structure into the associated `ErrorSchema`, stripping the `addError()` functions from it
 *
 * @param errorHandler - The `FormValidation` error handling structure
 * @returns - The `ErrorSchema` resulting from the stripping of the `addError()` function
 */
export default function unwrapErrorHandler<T = any>(errorHandler: FormValidation<T>): ErrorSchema<T> {
  return Object.keys(errorHandler).reduce((acc, key) => {
    if (key === 'addError') {
      return acc;
    } else {
      const childSchema = (errorHandler as GenericObjectType)[key];
      if (isPlainObject(childSchema)) {
        return {
          ...acc,
          [key]: unwrapErrorHandler(childSchema),
        };
      }
      return { ...acc, [key]: childSchema };
    }
  }, {} as ErrorSchema<T>);
}
