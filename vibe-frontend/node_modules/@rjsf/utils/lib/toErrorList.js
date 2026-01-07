import isPlainObject from 'lodash-es/isPlainObject.js';
import { ERRORS_KEY } from './constants.js';
/** Converts an `errorSchema` into a list of `RJSFValidationErrors`
 *
 * @param errorSchema - The `ErrorSchema` instance to convert
 * @param [fieldPath=[]] - The current field path, defaults to [] if not specified
 * @returns - The list of `RJSFValidationErrors` extracted from the `errorSchema`
 */
export default function toErrorList(errorSchema, fieldPath = []) {
    if (!errorSchema) {
        return [];
    }
    let errorList = [];
    if (ERRORS_KEY in errorSchema) {
        errorList = errorList.concat(errorSchema[ERRORS_KEY].map((message) => {
            const property = `.${fieldPath.join('.')}`;
            return {
                property,
                message,
                stack: `${property} ${message}`,
            };
        }));
    }
    return Object.keys(errorSchema).reduce((acc, key) => {
        if (key !== ERRORS_KEY) {
            const childSchema = errorSchema[key];
            if (isPlainObject(childSchema)) {
                acc = acc.concat(toErrorList(childSchema, [...fieldPath, key]));
            }
        }
        return acc;
    }, errorList);
}
//# sourceMappingURL=toErrorList.js.map