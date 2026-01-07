import toPath from 'lodash/toPath';

import { ErrorSchema, RJSFValidationError } from './types';
import ErrorSchemaBuilder from './ErrorSchemaBuilder';

/** Transforms a rjsf validation errors list:
 * [
 *   {property: '.level1.level2[2].level3', message: 'err a'},
 *   {property: '.level1.level2[2].level3', message: 'err b'},
 *   {property: '.level1.level2[4].level3', message: 'err b'},
 * ]
 * Into an error tree:
 * {
 *   level1: {
 *     level2: {
 *       2: {level3: {errors: ['err a', 'err b']}},
 *       4: {level3: {errors: ['err b']}},
 *     }
 *   }
 * };
 *
 * @param errors - The list of RJSFValidationError objects
 * @returns - The `ErrorSchema` built from the list of `RJSFValidationErrors`
 */
export default function toErrorSchema<T = any>(errors: RJSFValidationError[]): ErrorSchema<T> {
  const builder = new ErrorSchemaBuilder<T>();
  if (errors.length) {
    errors.forEach((error) => {
      const { property, message } = error;
      // When the property is the root element, just use an empty array for the path
      const path = property === '.' ? [] : toPath(property);
      // If the property is at the root (.level1) then toPath creates
      // an empty array element at the first index. Remove it.
      if (path.length > 0 && path[0] === '') {
        path.splice(0, 1);
      }
      if (message) {
        builder.addErrors(message, path);
      }
    });
  }
  return builder.ErrorSchema;
}
