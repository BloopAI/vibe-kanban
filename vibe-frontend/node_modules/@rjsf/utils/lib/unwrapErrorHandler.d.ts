import { ErrorSchema, FormValidation } from './types.js';
/** Unwraps the `errorHandler` structure into the associated `ErrorSchema`, stripping the `addError()` functions from it
 *
 * @param errorHandler - The `FormValidation` error handling structure
 * @returns - The `ErrorSchema` resulting from the stripping of the `addError()` function
 */
export default function unwrapErrorHandler<T = any>(errorHandler: FormValidation<T>): ErrorSchema<T>;
