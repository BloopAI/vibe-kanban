import isPlainObject from 'lodash-es/isPlainObject.js';
/** Unwraps the `errorHandler` structure into the associated `ErrorSchema`, stripping the `addError()` functions from it
 *
 * @param errorHandler - The `FormValidation` error handling structure
 * @returns - The `ErrorSchema` resulting from the stripping of the `addError()` function
 */
export default function unwrapErrorHandler(errorHandler) {
    return Object.keys(errorHandler).reduce((acc, key) => {
        if (key === 'addError') {
            return acc;
        }
        else {
            const childSchema = errorHandler[key];
            if (isPlainObject(childSchema)) {
                return {
                    ...acc,
                    [key]: unwrapErrorHandler(childSchema),
                };
            }
            return { ...acc, [key]: childSchema };
        }
    }, {});
}
//# sourceMappingURL=unwrapErrorHandler.js.map