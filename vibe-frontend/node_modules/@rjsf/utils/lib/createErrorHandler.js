import isPlainObject from 'lodash-es/isPlainObject.js';
import { ERRORS_KEY } from './constants.js';
/** Given a `formData` object, recursively creates a `FormValidation` error handling structure around it
 *
 * @param formData - The form data around which the error handler is created
 * @returns - A `FormValidation` object based on the `formData` structure
 */
export default function createErrorHandler(formData) {
    const handler = {
        // We store the list of errors for this node in a property named __errors
        // to avoid name collision with a possible sub schema field named
        // 'errors' (see `utils.toErrorSchema`).
        [ERRORS_KEY]: [],
        addError(message) {
            this[ERRORS_KEY].push(message);
        },
    };
    if (Array.isArray(formData)) {
        return formData.reduce((acc, value, key) => {
            return { ...acc, [key]: createErrorHandler(value) };
        }, handler);
    }
    if (isPlainObject(formData)) {
        const formObject = formData;
        return Object.keys(formObject).reduce((acc, key) => {
            return { ...acc, [key]: createErrorHandler(formObject[key]) };
        }, handler);
    }
    return handler;
}
//# sourceMappingURL=createErrorHandler.js.map